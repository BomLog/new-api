package controller

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"

	"github.com/gin-gonic/gin"
)

const (
	maxProbeHeartbeats       = 30
	probeDegradedLatencyMs   = 3000
	probeDegradedUptimeFloor = 0.95
	probeOutageUptimeFloor   = 0.80
	maxAutoProbeChannels     = 20
	channelProbeHistoryKey   = "console_setting.channel_probe_history"
)

const (
	monitorStatusOutage      = 0
	monitorStatusOperational = 1
	monitorStatusDegraded    = 2
	monitorStatusPending     = 3
)

type ProbeHeartbeat struct {
	Timestamp int64 `json:"t"`
	Success   bool  `json:"ok"`
	LatencyMs int64 `json:"ms"`
}

type Monitor struct {
	ID            string           `json:"id,omitempty"`
	Name          string           `json:"name"`
	Model         string           `json:"model,omitempty"`
	Uptime        float64          `json:"uptime"`
	Status        int              `json:"status"`
	Group         string           `json:"group,omitempty"`
	AvgLatencyMs  int64            `json:"avgLatencyMs"`
	LastLatencyMs int64            `json:"lastLatencyMs"`
	LastCheckedAt int64            `json:"lastCheckedAt"`
	TotalChecks   int              `json:"totalChecks"`
	SuccessChecks int              `json:"successChecks"`
	Heartbeats    []ProbeHeartbeat `json:"heartbeats"`
}

type UptimeGroupResult struct {
	CategoryName string    `json:"categoryName"`
	Monitors     []Monitor `json:"monitors"`
}

type channelProbeRunSummary struct {
	Total     int `json:"total"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Deferred  int `json:"deferred"`
}

type resolvedProbeItem struct {
	Key          string
	CategoryName string
	DisplayName  string
	ChannelID    int
	ModelName    string
	Group        string
	Prompt       string
	Stream       bool
	EndpointType string
	MaxTokens    uint
}

type channelActivityState struct {
	inFlight           atomic.Int64
	lastActiveUnixNano atomic.Int64
}

var (
	channelProbeHistoryMu     sync.RWMutex
	channelProbeHistoryCache  map[string][]ProbeHeartbeat
	channelProbeHistoryLoaded bool
	channelProbeRunning       atomic.Bool
	channelUserActivity       sync.Map // map[int]*channelActivityState
)

func getChannelActivityState(channelID int) *channelActivityState {
	if existing, ok := channelUserActivity.Load(channelID); ok {
		return existing.(*channelActivityState)
	}
	created := &channelActivityState{}
	actual, _ := channelUserActivity.LoadOrStore(channelID, created)
	return actual.(*channelActivityState)
}

// markChannelUserRequestStart records an active real-user request on channelID
// so scheduled channel probes can yield and defer until user traffic subsides.
func markChannelUserRequestStart(channelID int) func() {
	if channelID <= 0 {
		return func() {}
	}
	state := getChannelActivityState(channelID)
	state.inFlight.Add(1)
	state.lastActiveUnixNano.Store(time.Now().UnixNano())
	var once sync.Once
	return func() {
		once.Do(func() {
			state.lastActiveUnixNano.Store(time.Now().UnixNano())
			state.inFlight.Add(-1)
		})
	}
}

func channelBusyRemaining(channelID int, busyWindow time.Duration, now time.Time) time.Duration {
	if channelID <= 0 || busyWindow <= 0 {
		return 0
	}
	raw, ok := channelUserActivity.Load(channelID)
	if !ok {
		return 0
	}
	state := raw.(*channelActivityState)
	if state.inFlight.Load() > 0 {
		return min(busyWindow, 3*time.Second)
	}
	lastNano := state.lastActiveUnixNano.Load()
	if lastNano <= 0 {
		return 0
	}
	elapsed := now.Sub(time.Unix(0, lastNano))
	if elapsed < busyWindow {
		return busyWindow - elapsed
	}
	return 0
}

func channelProbeKey(channelID int, modelName string) string {
	return strconv.Itoa(channelID) + ":" + strings.TrimSpace(modelName)
}

func loadChannelProbeHistoryLocked() map[string][]ProbeHeartbeat {
	if channelProbeHistoryLoaded && channelProbeHistoryCache != nil {
		return channelProbeHistoryCache
	}
	history := make(map[string][]ProbeHeartbeat)
	raw := strings.TrimSpace(console_setting.GetConsoleSetting().ChannelProbeHistory)
	if raw == "" && model.DB != nil {
		var opt model.Option
		if err := model.DB.Where(model.DB.NamingStrategy.ColumnName("", "key")+" = ?", channelProbeHistoryKey).First(&opt).Error; err == nil {
			raw = strings.TrimSpace(opt.Value)
		}
	}
	if raw != "" {
		_ = common.UnmarshalJsonStr(raw, &history)
	}
	channelProbeHistoryCache = history
	channelProbeHistoryLoaded = true
	return channelProbeHistoryCache
}

// ResetChannelProbeHistoryCache clears the in-memory probe history cache so the
// next read reloads from persisted console settings.
func ResetChannelProbeHistoryCache() {
	channelProbeHistoryMu.Lock()
	defer channelProbeHistoryMu.Unlock()
	channelProbeHistoryCache = nil
	channelProbeHistoryLoaded = false
}

func recordChannelProbeResults(updates map[string]ProbeHeartbeat) error {
	if len(updates) == 0 {
		return nil
	}
	channelProbeHistoryMu.Lock()
	history := loadChannelProbeHistoryLocked()
	for key, beat := range updates {
		list := append(history[key], beat)
		if len(list) > maxProbeHeartbeats {
			list = list[len(list)-maxProbeHeartbeats:]
		}
		history[key] = list
	}
	snapshot := make(map[string][]ProbeHeartbeat, len(history))
	for k, v := range history {
		copied := make([]ProbeHeartbeat, len(v))
		copy(copied, v)
		snapshot[k] = copied
	}
	channelProbeHistoryMu.Unlock()

	encoded, err := common.Marshal(snapshot)
	if err != nil {
		return err
	}
	console_setting.GetConsoleSetting().ChannelProbeHistory = string(encoded)
	if model.DB != nil {
		if err := model.UpdateOption(channelProbeHistoryKey, string(encoded)); err != nil {
			return err
		}
	}
	return nil
}

func getProbeHistorySnapshot() map[string][]ProbeHeartbeat {
	channelProbeHistoryMu.RLock()
	if channelProbeHistoryLoaded && channelProbeHistoryCache != nil {
		out := make(map[string][]ProbeHeartbeat, len(channelProbeHistoryCache))
		for k, v := range channelProbeHistoryCache {
			copied := make([]ProbeHeartbeat, len(v))
			copy(copied, v)
			out[k] = copied
		}
		channelProbeHistoryMu.RUnlock()
		return out
	}
	channelProbeHistoryMu.RUnlock()

	channelProbeHistoryMu.Lock()
	defer channelProbeHistoryMu.Unlock()
	history := loadChannelProbeHistoryLocked()
	out := make(map[string][]ProbeHeartbeat, len(history))
	for k, v := range history {
		copied := make([]ProbeHeartbeat, len(v))
		copy(copied, v)
		out[k] = copied
	}
	return out
}

func inferProbeCategoryFromModel(modelName string) string {
	lower := strings.ToLower(modelName)
	switch {
	case strings.Contains(lower, "claude"):
		return "Anthropic"
	case strings.Contains(lower, "gpt") || strings.Contains(lower, "o1") || strings.Contains(lower, "o3") || strings.Contains(lower, "o4"):
		return "OpenAI"
	case strings.Contains(lower, "gemini") || strings.Contains(lower, "gemma"):
		return "Google"
	case strings.Contains(lower, "deepseek"):
		return "DeepSeek"
	case strings.Contains(lower, "qwen"):
		return "Qwen"
	case strings.Contains(lower, "grok"):
		return "xAI"
	case strings.Contains(lower, "llama"):
		return "Meta"
	default:
		return "General"
	}
}

func defaultModelForChannel(ch *model.Channel) string {
	if ch == nil {
		return ""
	}
	if ch.TestModel != nil && strings.TrimSpace(*ch.TestModel) != "" {
		return strings.TrimSpace(*ch.TestModel)
	}
	for _, m := range ch.GetModels() {
		if trimmed := strings.TrimSpace(m); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func primaryGroupOfChannel(ch *model.Channel) string {
	if ch == nil {
		return ""
	}
	first, _, _ := strings.Cut(ch.Group, ",")
	return strings.TrimSpace(first)
}

func resolveChannelProbeItems() ([]resolvedProbeItem, map[int]*model.Channel, error) {
	if model.DB == nil {
		return nil, map[int]*model.Channel{}, nil
	}
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		return nil, nil, err
	}
	channelByID := make(map[int]*model.Channel, len(channels))
	for _, ch := range channels {
		if ch != nil {
			channelByID[ch.Id] = ch
		}
	}

	globalOpts := console_setting.GetChannelProbeOptions()
	configured := console_setting.GetChannelProbeTargets()
	items := make([]resolvedProbeItem, 0)
	seenKeys := make(map[string]struct{})

	if len(configured) > 0 {
		for _, target := range configured {
			ch := channelByID[target.ChannelID]
			if ch == nil || ch.Status == common.ChannelStatusManuallyDisabled {
				continue
			}
			models := make([]string, 0, len(target.Models))
			for _, m := range target.Models {
				if trimmed := strings.TrimSpace(m); trimmed != "" && !slices.Contains(models, trimmed) {
					models = append(models, trimmed)
				}
			}
			if len(models) == 0 {
				if fallback := defaultModelForChannel(ch); fallback != "" {
					models = append(models, fallback)
				}
			}
			category := strings.TrimSpace(target.CategoryName)
			if category == "" {
				category = "General"
			}
			groupLabel := strings.TrimSpace(target.Group)
			if groupLabel == "" {
				groupLabel = primaryGroupOfChannel(ch)
			}
			effectivePrompt := strings.TrimSpace(target.Prompt)
			if effectivePrompt == "" {
				effectivePrompt = globalOpts.Prompt
			}
			effectiveStream := globalOpts.Stream
			if target.Stream != nil {
				effectiveStream = *target.Stream
			}
			effectiveEndpoint := strings.TrimSpace(target.EndpointType)
			if effectiveEndpoint == "" {
				effectiveEndpoint = globalOpts.EndpointType
			}
			effectiveMaxTokens := target.MaxTokens
			if effectiveMaxTokens == 0 {
				effectiveMaxTokens = globalOpts.MaxTokens
			}
			for _, modelName := range models {
				key := channelProbeKey(ch.Id, modelName)
				if _, exists := seenKeys[key]; exists {
					continue
				}
				seenKeys[key] = struct{}{}
				displayName := strings.TrimSpace(target.DisplayName)
				if displayName == "" {
					displayName = modelName
				} else if len(models) > 1 {
					displayName = fmt.Sprintf("%s · %s", displayName, modelName)
				}
				items = append(items, resolvedProbeItem{
					Key:          key,
					CategoryName: category,
					DisplayName:  displayName,
					ChannelID:    ch.Id,
					ModelName:    modelName,
					Group:        groupLabel,
					Prompt:       effectivePrompt,
					Stream:       effectiveStream,
					EndpointType: effectiveEndpoint,
					MaxTokens:    effectiveMaxTokens,
				})
			}
		}
		return items, channelByID, nil
	}

	// Default auto-discovery from enabled channels (sanitized: never exposes internal channel names/IDs).
	count := 0
	for _, ch := range channels {
		if ch == nil || ch.Status != common.ChannelStatusEnabled {
			continue
		}
		modelName := defaultModelForChannel(ch)
		if modelName == "" {
			continue
		}
		key := channelProbeKey(ch.Id, modelName)
		if _, exists := seenKeys[key]; exists {
			continue
		}
		seenKeys[key] = struct{}{}
		items = append(items, resolvedProbeItem{
			Key:          key,
			CategoryName: inferProbeCategoryFromModel(modelName),
			DisplayName:  modelName,
			ChannelID:    ch.Id,
			ModelName:    modelName,
			Group:        primaryGroupOfChannel(ch),
			Prompt:       globalOpts.Prompt,
			Stream:       globalOpts.Stream,
			EndpointType: globalOpts.EndpointType,
			MaxTokens:    globalOpts.MaxTokens,
		})
		count++
		if count >= maxAutoProbeChannels {
			break
		}
	}
	return items, channelByID, nil
}

func summarizeProbeMonitor(item resolvedProbeItem, heartbeats []ProbeHeartbeat) Monitor {
	monitor := Monitor{
		ID:         item.Key,
		Name:       item.DisplayName,
		Model:      item.ModelName,
		Group:      item.Group,
		Status:     monitorStatusPending,
		Heartbeats: heartbeats,
	}
	if len(heartbeats) == 0 {
		monitor.Heartbeats = []ProbeHeartbeat{}
		return monitor
	}

	total := len(heartbeats)
	successCount := 0
	var latencySum int64
	latencySamples := 0

	for _, beat := range heartbeats {
		if beat.Success {
			successCount++
			if beat.LatencyMs > 0 {
				latencySum += beat.LatencyMs
				latencySamples++
			}
		}
	}

	uptime := float64(successCount) / float64(total)
	last := heartbeats[total-1]

	var avgLatency int64
	if latencySamples > 0 {
		avgLatency = latencySum / int64(latencySamples)
	}

	status := monitorStatusOperational
	if !last.Success {
		consecutiveFail := total >= 2 && !heartbeats[total-2].Success
		if consecutiveFail || uptime < probeOutageUptimeFloor {
			status = monitorStatusOutage
		} else {
			status = monitorStatusDegraded
		}
	} else if uptime < probeDegradedUptimeFloor || last.LatencyMs > probeDegradedLatencyMs {
		status = monitorStatusDegraded
	}

	monitor.Uptime = uptime
	monitor.Status = status
	monitor.AvgLatencyMs = avgLatency
	monitor.LastLatencyMs = last.LatencyMs
	monitor.LastCheckedAt = last.Timestamp
	monitor.TotalChecks = total
	monitor.SuccessChecks = successCount
	return monitor
}

func buildChannelProbeStatusResults() ([]UptimeGroupResult, error) {
	items, _, err := resolveChannelProbeItems()
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return []UptimeGroupResult{}, nil
	}

	history := getProbeHistorySnapshot()
	groupIndex := make(map[string]int)
	results := make([]UptimeGroupResult, 0)

	for _, item := range items {
		monitor := summarizeProbeMonitor(item, history[item.Key])
		idx, exists := groupIndex[item.CategoryName]
		if !exists {
			idx = len(results)
			groupIndex[item.CategoryName] = idx
			results = append(results, UptimeGroupResult{
				CategoryName: item.CategoryName,
				Monitors:     []Monitor{},
			})
		}
		results[idx].Monitors = append(results[idx].Monitors, monitor)
	}
	return results, nil
}

type queuedProbeItem struct {
	item       resolvedProbeItem
	readyAt    time.Time
	enqueuedAt time.Time
}

func executeQueuedProbes(
	ctx context.Context,
	items []resolvedProbeItem,
	opts console_setting.ChannelProbeOptions,
	respectUserTraffic bool,
	probeFn func(ctx context.Context, item resolvedProbeItem) ProbeHeartbeat,
	report func(processed, total int),
) (channelProbeRunSummary, map[string]ProbeHeartbeat) {
	total := len(items)
	summary := channelProbeRunSummary{Total: total}
	updates := make(map[string]ProbeHeartbeat, total)
	if total == 0 {
		return summary, updates
	}

	singleTimeout := time.Duration(max(opts.TimeoutSeconds, 5)) * time.Second
	queueDelay := time.Duration(max(opts.QueueDelayMs, 0)) * time.Millisecond
	busyWindow := time.Duration(max(opts.UserBusyWindowSec, 0)) * time.Second
	maxDefer := time.Duration(max(opts.MaxDeferSec, 0)) * time.Second

	startNow := time.Now()
	queue := make([]queuedProbeItem, 0, total)
	for _, item := range items {
		queue = append(queue, queuedProbeItem{
			item:       item,
			readyAt:    startNow,
			enqueuedAt: startNow,
		})
	}

	processed := 0
	executedAny := false

	for len(queue) > 0 {
		if ctx.Err() != nil {
			break
		}
		now := time.Now()
		readyIdx := -1
		earliestIdx := 0
		for i := range queue {
			if !queue[i].readyAt.After(now) {
				readyIdx = i
				break
			}
			if queue[i].readyAt.Before(queue[earliestIdx].readyAt) {
				earliestIdx = i
			}
		}

		if readyIdx == -1 {
			waitDur := time.Until(queue[earliestIdx].readyAt)
			if waitDur > 0 {
				timer := time.NewTimer(waitDur)
				select {
				case <-ctx.Done():
					timer.Stop()
					return summary, updates
				case <-timer.C:
				}
			}
			continue
		}

		current := queue[readyIdx]
		queue = append(queue[:readyIdx], queue[readyIdx+1:]...)

		if respectUserTraffic && busyWindow > 0 {
			if busyWait := channelBusyRemaining(current.item.ChannelID, busyWindow, time.Now()); busyWait > 0 {
				nowCheck := time.Now()
				if maxDefer == 0 || nowCheck.Sub(current.enqueuedAt)+busyWait > maxDefer {
					summary.Deferred++
					processed++
					if report != nil {
						report(processed, total)
					}
					continue
				}
				current.readyAt = nowCheck.Add(busyWait)
				queue = append(queue, current)
				continue
			}
		}

		if executedAny && queueDelay > 0 {
			timer := time.NewTimer(queueDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return summary, updates
			case <-timer.C:
			}
		}
		executedAny = true

		probeCtx, cancel := context.WithTimeout(ctx, singleTimeout)
		beat := probeFn(probeCtx, current.item)
		cancel()

		updates[current.item.Key] = beat
		if beat.Success {
			summary.Succeeded++
		} else {
			summary.Failed++
		}
		processed++
		if report != nil {
			report(processed, total)
		}
	}

	return summary, updates
}

func runChannelProbeTask(ctx context.Context, respectUserTraffic bool, report func(processed, total int)) (channelProbeRunSummary, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if !channelProbeRunning.CompareAndSwap(false, true) {
		return channelProbeRunSummary{}, fmt.Errorf("channel probe is already running")
	}
	defer channelProbeRunning.Store(false)

	items, channelByID, err := resolveChannelProbeItems()
	if err != nil {
		return channelProbeRunSummary{}, err
	}
	total := len(items)
	if report != nil {
		report(0, total)
	}
	if total == 0 {
		return channelProbeRunSummary{}, nil
	}

	testUserID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return channelProbeRunSummary{}, err
	}

	opts := console_setting.GetChannelProbeOptions()
	summary, updates := executeQueuedProbes(
		ctx,
		items,
		opts,
		respectUserTraffic,
		func(probeCtx context.Context, item resolvedProbeItem) ProbeHeartbeat {
			ch := channelByID[item.ChannelID]
			if ch == nil {
				return ProbeHeartbeat{
					Timestamp: time.Now().Unix(),
					Success:   false,
					LatencyMs: 1,
				}
			}
			startedAt := time.Now()
			res := testChannelWithOptions(
				probeCtx,
				ch,
				testUserID,
				item.ModelName,
				item.EndpointType,
				item.Stream,
				channelTestCustomOptions{
					Prompt:    item.Prompt,
					MaxTokens: item.MaxTokens,
				},
			)
			latencyMs := time.Since(startedAt).Milliseconds()
			ok := res.localErr == nil && res.newAPIError == nil
			return ProbeHeartbeat{
				Timestamp: time.Now().Unix(),
				Success:   ok,
				LatencyMs: max(latencyMs, int64(1)),
			}
		},
		report,
	)

	if err := recordChannelProbeResults(updates); err != nil {
		return summary, err
	}
	return summary, nil
}

// GetUptimeKumaStatus serves the built-in channel model availability and
// success-rate status groups (replacing external Uptime Kuma polling).
func GetUptimeKumaStatus(c *gin.Context) {
	if !console_setting.GetConsoleSetting().UptimeKumaEnabled {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": []UptimeGroupResult{}})
		return
	}
	results, err := buildChannelProbeStatusResults()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": results})
}

// TriggerChannelProbe runs one immediate probe cycle for all configured channel
// models (RootAuth only) and returns both the run summary and updated status groups.
func TriggerChannelProbe(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	summary, err := runChannelProbeTask(ctx, false, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	results, err := buildChannelProbeStatusResults()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"summary": summary,
			"groups":  results,
		},
	})
}
