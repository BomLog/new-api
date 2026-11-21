package console_setting

import (
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
)

var (
	urlRegex       = regexp.MustCompile(`^https?://(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?:\:[0-9]{1,5})?(?:/.*)?$`)
	dangerousChars = []string{"<script", "<iframe", "javascript:", "onload=", "onerror=", "onclick="}
	validColors    = map[string]bool{
		"blue": true, "green": true, "cyan": true, "purple": true, "pink": true,
		"red": true, "orange": true, "amber": true, "yellow": true, "lime": true,
		"light-green": true, "teal": true, "light-blue": true, "indigo": true,
		"violet": true, "grey": true, "slate": true,
	}
	slugRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

func parseJSONArray(jsonStr string, formatErrorKey string) ([]map[string]any, error) {
	var list []map[string]any
	if err := common.UnmarshalJsonStr(jsonStr, &list); err != nil {
		return nil, common.NewMessage(formatErrorKey, map[string]any{"error": err.Error()})
	}
	return list, nil
}

func exceedsMaxCharacters(s string, max int) bool {
	return len(utf16.Encode([]rune(s))) > max
}

// itemMessages are the keys of the URL and content checks shared by the
// API info and Uptime Kuma group lists.
type itemMessages struct {
	invalidURL    string
	unparsableURL string
	unsafeContent string
}

var (
	apiInfoMessages = itemMessages{
		invalidURL:    "API info #{{index}} has an invalid URL format",
		unparsableURL: "API info #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "API info #{{index}} contains disallowed content",
	}
	groupMessages = itemMessages{
		invalidURL:    "Group #{{index}} has an invalid URL format",
		unparsableURL: "Group #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "Group #{{index}} contains disallowed content",
	}
)

func validateURL(urlStr string, index int, messages itemMessages) error {
	if !urlRegex.MatchString(urlStr) {
		return common.NewMessage(messages.invalidURL, map[string]any{"index": index})
	}
	if _, err := url.Parse(urlStr); err != nil {
		return common.NewMessage(messages.unparsableURL, map[string]any{"index": index, "error": err.Error()})
	}
	return nil
}

func checkDangerousContent(content string, index int, messages itemMessages) error {
	lower := strings.ToLower(content)
	for _, d := range dangerousChars {
		if strings.Contains(lower, d) {
			return common.NewMessage(messages.unsafeContent, map[string]any{"index": index})
		}
	}
	return nil
}

func getJSONList(jsonStr string) []map[string]any {
	if jsonStr == "" {
		return []map[string]any{}
	}
	var list []map[string]any
	_ = common.UnmarshalJsonStr(jsonStr, &list)
	return list
}

func ValidateConsoleSettings(settingsStr string, settingType string) error {
	if settingsStr == "" {
		return nil
	}

	switch settingType {
	case "ApiInfo":
		return validateApiInfo(settingsStr)
	case "Announcements":
		return validateAnnouncements(settingsStr)
	case "FAQ":
		return validateFAQ(settingsStr)
	case "UptimeKumaGroups":
		return validateUptimeKumaGroups(settingsStr)
	case "ChannelProbeTargets":
		return ValidateChannelProbeTargets(settingsStr)
	case "ChannelProbeOptions":
		return ValidateChannelProbeOptions(settingsStr)
	default:
		return common.NewMessage("Unknown setting type: {{type}}", map[string]any{"type": settingType})
	}
}

func validateApiInfo(apiInfoStr string) error {
	apiInfoList, err := parseJSONArray(apiInfoStr, "Invalid API info format: {{error}}")
	if err != nil {
		return err
	}

	if len(apiInfoList) > 50 {
		return common.NewMessage("API info cannot exceed 50 entries")
	}

	for i, apiInfo := range apiInfoList {
		urlStr, ok := apiInfo["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("API info #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		route, ok := apiInfo["route"].(string)
		if !ok || route == "" {
			return common.NewMessage("API info #{{index}} is missing the route description field", map[string]any{"index": i + 1})
		}
		description, ok := apiInfo["description"].(string)
		if !ok || description == "" {
			return common.NewMessage("API info #{{index}} is missing the description field", map[string]any{"index": i + 1})
		}
		color, ok := apiInfo["color"].(string)
		if !ok || color == "" {
			return common.NewMessage("API info #{{index}} is missing the color field", map[string]any{"index": i + 1})
		}

		if err := validateURL(urlStr, i+1, apiInfoMessages); err != nil {
			return err
		}

		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("API info #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(route, 100) {
			return common.NewMessage("API info #{{index}} route description cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("API info #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !validColors[color] {
			return common.NewMessage("API info #{{index}} has an invalid color value", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, apiInfoMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(route, i+1, apiInfoMessages); err != nil {
			return err
		}
	}
	return nil
}

func GetApiInfo() []map[string]any {
	return getJSONList(GetConsoleSetting().ApiInfo)
}

func validateAnnouncements(announcementsStr string) error {
	list, err := parseJSONArray(announcementsStr, "Invalid announcements format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("Announcements cannot exceed 100 entries")
	}
	validTypes := map[string]bool{
		"default": true, "ongoing": true, "success": true, "warning": true, "error": true,
	}
	for i, ann := range list {
		content, ok := ann["content"].(string)
		if !ok || content == "" {
			return common.NewMessage("Announcement #{{index}} is missing the content field", map[string]any{"index": i + 1})
		}
		publishDateAny, exists := ann["publishDate"]
		if !exists {
			return common.NewMessage("Announcement #{{index}} is missing the publish date field", map[string]any{"index": i + 1})
		}
		publishDateStr, ok := publishDateAny.(string)
		if !ok || publishDateStr == "" {
			return common.NewMessage("Announcement #{{index}} publish date cannot be empty", map[string]any{"index": i + 1})
		}
		if _, err := time.Parse(time.RFC3339, publishDateStr); err != nil {
			return common.NewMessage("Announcement #{{index}} has an invalid publish date format", map[string]any{"index": i + 1})
		}
		if t, exists := ann["type"]; exists {
			if typeStr, ok := t.(string); ok {
				if !validTypes[typeStr] {
					return common.NewMessage("Announcement #{{index}} has an invalid type value", map[string]any{"index": i + 1})
				}
			}
		}
		if exceedsMaxCharacters(content, 500) {
			return common.NewMessage("Announcement #{{index}} content cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if extra, exists := ann["extra"]; exists {
			if extraStr, ok := extra.(string); ok && exceedsMaxCharacters(extraStr, 100) {
				return common.NewMessage("Announcement #{{index}} note cannot exceed 100 characters", map[string]any{"index": i + 1})
			}
		}
	}
	return nil
}

func validateFAQ(faqStr string) error {
	list, err := parseJSONArray(faqStr, "Invalid FAQ format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("FAQ cannot exceed 100 entries")
	}
	for i, faq := range list {
		question, ok := faq["question"].(string)
		if !ok || question == "" {
			return common.NewMessage("FAQ #{{index}} is missing the question field", map[string]any{"index": i + 1})
		}
		answer, ok := faq["answer"].(string)
		if !ok || answer == "" {
			return common.NewMessage("FAQ #{{index}} is missing the answer field", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(question, 200) {
			return common.NewMessage("FAQ #{{index}} question cannot exceed 200 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(answer, 1000) {
			return common.NewMessage("FAQ #{{index}} answer cannot exceed 1000 characters", map[string]any{"index": i + 1})
		}
	}
	return nil
}

func getPublishTime(item map[string]any) time.Time {
	if v, ok := item["publishDate"]; ok {
		if s, ok2 := v.(string); ok2 {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

func GetAnnouncements() []map[string]any {
	list := getJSONList(GetConsoleSetting().Announcements)
	sort.SliceStable(list, func(i, j int) bool {
		return getPublishTime(list[i]).After(getPublishTime(list[j]))
	})
	return list
}

func GetFAQ() []map[string]any {
	return getJSONList(GetConsoleSetting().FAQ)
}

func validateUptimeKumaGroups(groupsStr string) error {
	groups, err := parseJSONArray(groupsStr, "Invalid Uptime Kuma group settings format: {{error}}")
	if err != nil {
		return err
	}

	if len(groups) > 20 {
		return common.NewMessage("Uptime Kuma groups cannot exceed 20 entries")
	}

	nameSet := make(map[string]bool)

	for i, group := range groups {
		categoryName, ok := group["categoryName"].(string)
		if !ok || categoryName == "" {
			return common.NewMessage("Group #{{index}} is missing the category name field", map[string]any{"index": i + 1})
		}
		if nameSet[categoryName] {
			return common.NewMessage("Group #{{index}} category name duplicates another group", map[string]any{"index": i + 1})
		}
		nameSet[categoryName] = true
		urlStr, ok := group["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("Group #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		slug, ok := group["slug"].(string)
		if !ok || slug == "" {
			return common.NewMessage("Group #{{index}} is missing the slug field", map[string]any{"index": i + 1})
		}
		description, ok := group["description"].(string)
		if !ok {
			description = ""
		}

		if err := validateURL(urlStr, i+1, groupMessages); err != nil {
			return err
		}

		if exceedsMaxCharacters(categoryName, 50) {
			return common.NewMessage("Group #{{index}} category name cannot exceed 50 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("Group #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(slug, 100) {
			return common.NewMessage("Group #{{index}} slug cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("Group #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !slugRegex.MatchString(slug) {
			return common.NewMessage("Group #{{index}} slug can only contain letters, numbers, underscores and hyphens", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, groupMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(categoryName, i+1, groupMessages); err != nil {
			return err
		}
	}
	return nil
}

func GetUptimeKumaGroups() []map[string]any {
	return getJSONList(GetConsoleSetting().UptimeKumaGroups)
}

var validProbeEndpointTypes = map[string]bool{
	"":                 true,
	"openai":           true,
	"openai-response":  true,
	"anthropic":        true,
	"gemini":           true,
	"embeddings":       true,
	"jina-rerank":      true,
	"image-generation": true,
}

type ChannelProbeTarget struct {
	ID           string   `json:"id"`
	CategoryName string   `json:"categoryName"`
	DisplayName  string   `json:"displayName,omitempty"`
	ChannelID    int      `json:"channelId"`
	Models       []string `json:"models"`
	Group        string   `json:"group,omitempty"`
	Prompt       string   `json:"prompt,omitempty"`
	Stream       *bool    `json:"stream,omitempty"`
	EndpointType string   `json:"endpointType,omitempty"`
	MaxTokens    uint     `json:"maxTokens,omitempty"`
}

type ChannelProbeOptions struct {
	Prompt            string `json:"prompt,omitempty"`
	Stream            bool   `json:"stream"`
	EndpointType      string `json:"endpointType,omitempty"`
	MaxTokens         uint   `json:"maxTokens,omitempty"`
	TimeoutSeconds    int    `json:"timeoutSeconds,omitempty"`
	QueueDelayMs      int    `json:"queueDelayMs,omitempty"`
	UserBusyWindowSec int    `json:"userBusyWindowSec,omitempty"`
	MaxDeferSec       int    `json:"maxDeferSec,omitempty"`
}

func DefaultChannelProbeOptions() ChannelProbeOptions {
	return ChannelProbeOptions{
		Prompt:            "hi",
		Stream:            false,
		EndpointType:      "",
		MaxTokens:         16,
		TimeoutSeconds:    25,
		QueueDelayMs:      500,
		UserBusyWindowSec: 30,
		MaxDeferSec:       60,
	}
}

func ValidateChannelProbeOptions(optionsStr string) error {
	if strings.TrimSpace(optionsStr) == "" {
		return nil
	}
	var opts ChannelProbeOptions
	if err := common.UnmarshalJsonStr(optionsStr, &opts); err != nil {
		return common.NewMessage("Invalid channel probe options format: {{error}}", map[string]any{"error": err.Error()})
	}
	if opts.Prompt != "" {
		if exceedsMaxCharacters(opts.Prompt, 500) {
			return common.NewMessage("Probe prompt cannot exceed 500 characters")
		}
		if err := checkDangerousContent(opts.Prompt, 1, groupMessages); err != nil {
			return err
		}
	}
	endpoint := strings.TrimSpace(opts.EndpointType)
	if !validProbeEndpointTypes[endpoint] {
		return common.NewMessage("Invalid probe endpoint type: {{endpoint}}", map[string]any{"endpoint": endpoint})
	}
	if opts.MaxTokens > 16384 {
		return common.NewMessage("Probe max tokens cannot exceed 16384")
	}
	if opts.TimeoutSeconds != 0 && (opts.TimeoutSeconds < 5 || opts.TimeoutSeconds > 120) {
		return common.NewMessage("Probe timeout must be between 5 and 120 seconds")
	}
	if opts.QueueDelayMs < 0 || opts.QueueDelayMs > 10000 {
		return common.NewMessage("Probe queue delay must be between 0 and 10000 milliseconds")
	}
	if opts.UserBusyWindowSec < 0 || opts.UserBusyWindowSec > 300 {
		return common.NewMessage("User activity defer window must be between 0 and 300 seconds")
	}
	if opts.MaxDeferSec < 0 || opts.MaxDeferSec > 600 {
		return common.NewMessage("Maximum defer wait must be between 0 and 600 seconds")
	}
	return nil
}

func GetChannelProbeOptions() ChannelProbeOptions {
	defaults := DefaultChannelProbeOptions()
	raw := strings.TrimSpace(GetConsoleSetting().ChannelProbeOptions)
	if raw == "" {
		return defaults
	}
	var parsed map[string]any
	if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
		return defaults
	}
	var opts ChannelProbeOptions
	if err := common.UnmarshalJsonStr(raw, &opts); err != nil {
		return defaults
	}
	if strings.TrimSpace(opts.Prompt) == "" {
		opts.Prompt = defaults.Prompt
	} else {
		opts.Prompt = strings.TrimSpace(opts.Prompt)
	}
	endpoint := strings.TrimSpace(opts.EndpointType)
	if !validProbeEndpointTypes[endpoint] {
		endpoint = ""
	}
	opts.EndpointType = endpoint
	if _, ok := parsed["maxTokens"]; !ok {
		opts.MaxTokens = defaults.MaxTokens
	} else if opts.MaxTokens > 16384 {
		opts.MaxTokens = 16384
	}
	if opts.TimeoutSeconds < 5 || opts.TimeoutSeconds > 120 {
		opts.TimeoutSeconds = defaults.TimeoutSeconds
	}
	if _, ok := parsed["queueDelayMs"]; !ok {
		opts.QueueDelayMs = defaults.QueueDelayMs
	} else {
		opts.QueueDelayMs = min(max(opts.QueueDelayMs, 0), 10000)
	}
	if _, ok := parsed["userBusyWindowSec"]; !ok {
		opts.UserBusyWindowSec = defaults.UserBusyWindowSec
	} else {
		opts.UserBusyWindowSec = min(max(opts.UserBusyWindowSec, 0), 300)
	}
	if _, ok := parsed["maxDeferSec"]; !ok {
		opts.MaxDeferSec = defaults.MaxDeferSec
	} else {
		opts.MaxDeferSec = min(max(opts.MaxDeferSec, 0), 600)
	}
	return opts
}

func ValidateChannelProbeTargets(targetsStr string) error {
	if strings.TrimSpace(targetsStr) == "" {
		return nil
	}
	var targets []ChannelProbeTarget
	if err := common.UnmarshalJsonStr(targetsStr, &targets); err != nil {
		return common.NewMessage("Invalid channel probe targets format: {{error}}", map[string]any{"error": err.Error()})
	}
	if len(targets) > 40 {
		return common.NewMessage("Channel probe targets cannot exceed 40 entries")
	}
	for i, target := range targets {
		idx := i + 1
		categoryName := strings.TrimSpace(target.CategoryName)
		if categoryName == "" {
			return common.NewMessage("Probe target #{{index}} is missing the category name field", map[string]any{"index": idx})
		}
		if exceedsMaxCharacters(categoryName, 50) {
			return common.NewMessage("Probe target #{{index}} category name cannot exceed 50 characters", map[string]any{"index": idx})
		}
		if target.ChannelID <= 0 {
			return common.NewMessage("Probe target #{{index}} must specify a valid channel", map[string]any{"index": idx})
		}
		if len(target.Models) > 10 {
			return common.NewMessage("Probe target #{{index}} cannot exceed 10 models", map[string]any{"index": idx})
		}
		if err := checkDangerousContent(categoryName, idx, groupMessages); err != nil {
			return err
		}
		if target.DisplayName != "" {
			if exceedsMaxCharacters(target.DisplayName, 80) {
				return common.NewMessage("Probe target #{{index}} display name cannot exceed 80 characters", map[string]any{"index": idx})
			}
			if err := checkDangerousContent(target.DisplayName, idx, groupMessages); err != nil {
				return err
			}
		}
		if target.Prompt != "" {
			if exceedsMaxCharacters(target.Prompt, 500) {
				return common.NewMessage("Probe target #{{index}} prompt cannot exceed 500 characters", map[string]any{"index": idx})
			}
			if err := checkDangerousContent(target.Prompt, idx, groupMessages); err != nil {
				return err
			}
		}
		endpoint := strings.TrimSpace(target.EndpointType)
		if !validProbeEndpointTypes[endpoint] {
			return common.NewMessage("Probe target #{{index}} has an invalid endpoint type", map[string]any{"index": idx})
		}
		if target.MaxTokens > 16384 {
			return common.NewMessage("Probe target #{{index}} max tokens cannot exceed 16384", map[string]any{"index": idx})
		}
		for _, m := range target.Models {
			modelName := strings.TrimSpace(m)
			if exceedsMaxCharacters(modelName, 120) {
				return common.NewMessage("Probe target #{{index}} model name cannot exceed 120 characters", map[string]any{"index": idx})
			}
			if err := checkDangerousContent(modelName, idx, groupMessages); err != nil {
				return err
			}
		}
	}
	return nil
}

func GetChannelProbeTargets() []ChannelProbeTarget {
	raw := strings.TrimSpace(GetConsoleSetting().ChannelProbeTargets)
	if raw == "" {
		return []ChannelProbeTarget{}
	}
	var targets []ChannelProbeTarget
	if err := common.UnmarshalJsonStr(raw, &targets); err != nil {
		return []ChannelProbeTarget{}
	}
	return targets
}

func GetChannelProbeIntervalMinutes() int {
	interval := GetConsoleSetting().ChannelProbeIntervalMinutes
	if interval < 1 {
		return 15
	}
	if interval > 1440 {
		return 1440
	}
	return interval
}
