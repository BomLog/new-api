package controller

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSummarizeProbeMonitor(t *testing.T) {
	item := resolvedProbeItem{
		Key:          "1:gpt-4o",
		CategoryName: "OpenAI",
		DisplayName:  "GPT-4o Main",
		ChannelID:    1,
		ModelName:    "gpt-4o",
		Group:        "default",
	}

	pending := summarizeProbeMonitor(item, nil)
	assert.Equal(t, monitorStatusPending, pending.Status)
	assert.Equal(t, 0, pending.TotalChecks)
	assert.Empty(t, pending.Heartbeats)

	healthyBeats := []ProbeHeartbeat{
		{Timestamp: 100, Success: true, LatencyMs: 420},
		{Timestamp: 200, Success: true, LatencyMs: 380},
	}
	healthy := summarizeProbeMonitor(item, healthyBeats)
	assert.Equal(t, monitorStatusOperational, healthy.Status)
	assert.InDelta(t, 1.0, healthy.Uptime, 1e-6)
	assert.Equal(t, int64(400), healthy.AvgLatencyMs)
	assert.Equal(t, int64(380), healthy.LastLatencyMs)

	degradedBeats := []ProbeHeartbeat{
		{Timestamp: 100, Success: true, LatencyMs: 400},
		{Timestamp: 200, Success: true, LatencyMs: 450},
		{Timestamp: 300, Success: true, LatencyMs: 500},
		{Timestamp: 400, Success: true, LatencyMs: 420},
		{Timestamp: 500, Success: false, LatencyMs: 2000},
	}
	degraded := summarizeProbeMonitor(item, degradedBeats)
	assert.Equal(t, monitorStatusDegraded, degraded.Status)
	assert.InDelta(t, 0.8, degraded.Uptime, 1e-6)

	outageBeats := []ProbeHeartbeat{
		{Timestamp: 100, Success: true, LatencyMs: 400},
		{Timestamp: 200, Success: false, LatencyMs: 1200},
		{Timestamp: 300, Success: false, LatencyMs: 1500},
	}
	outage := summarizeProbeMonitor(item, outageBeats)
	assert.Equal(t, monitorStatusOutage, outage.Status)
	assert.InDelta(t, 1.0/3.0, outage.Uptime, 1e-6)
}

func TestValidateChannelProbeTargetsAndOptions(t *testing.T) {
	require.NoError(t, console_setting.ValidateChannelProbeTargets(""))
	require.NoError(t, console_setting.ValidateChannelProbeTargets(`[{"id":"1","categoryName":"OpenAI","displayName":"GPT-4o","channelId":1,"models":["gpt-4o","gpt-4o-mini"],"group":"default","prompt":"hi","stream":false,"endpointType":"openai","maxTokens":32}]`))

	err := console_setting.ValidateChannelProbeTargets(`[{"id":"1","categoryName":"","channelId":1,"models":["gpt-4o"]}]`)
	require.Error(t, err)

	err = console_setting.ValidateChannelProbeTargets(`[{"id":"1","categoryName":"OpenAI","channelId":0,"models":["gpt-4o"]}]`)
	require.Error(t, err)

	err = console_setting.ValidateChannelProbeTargets(`[{"id":"1","categoryName":"OpenAI","channelId":1,"models":["gpt-4o"],"endpointType":"unknown"}]`)
	require.Error(t, err)

	require.NoError(t, console_setting.ValidateChannelProbeOptions(""))
	require.NoError(t, console_setting.ValidateChannelProbeOptions(`{"prompt":"hi","stream":false,"endpointType":"openai","maxTokens":16,"timeoutSeconds":20,"queueDelayMs":200,"userBusyWindowSec":30,"maxDeferSec":60}`))
	require.Error(t, console_setting.ValidateChannelProbeOptions(`{"timeoutSeconds":2}`))
	require.Error(t, console_setting.ValidateChannelProbeOptions(`{"endpointType":"bad"}`))
	require.Error(t, console_setting.ValidateChannelProbeOptions(`{"userBusyWindowSec":500}`))
}

func TestBuildTestRequestWithCustomOptions(t *testing.T) {
	reqOpenAI := buildTestRequestWithOptions("gpt-4o", "openai", nil, false, channelTestCustomOptions{
		Prompt:    "ping",
		MaxTokens: 24,
	})
	openAIReq, ok := reqOpenAI.(*dto.GeneralOpenAIRequest)
	require.True(t, ok)
	require.NotNil(t, openAIReq.Stream)
	assert.False(t, *openAIReq.Stream)
	require.NotNil(t, openAIReq.MaxTokens)
	assert.Equal(t, uint(24), *openAIReq.MaxTokens)
	require.Len(t, openAIReq.Messages, 1)
	assert.Equal(t, "ping", openAIReq.Messages[0].StringContent())

	reqClaude := buildTestRequestWithOptions("claude-sonnet-4-6", "anthropic", nil, true, channelTestCustomOptions{
		Prompt:    "Reply OK",
		MaxTokens: 32,
	})
	claudeReq, ok := reqClaude.(*dto.ClaudeRequest)
	require.True(t, ok)
	require.NotNil(t, claudeReq.Stream)
	assert.True(t, *claudeReq.Stream)
	require.NotNil(t, claudeReq.MaxTokens)
	assert.Equal(t, uint(32), *claudeReq.MaxTokens)
	require.Len(t, claudeReq.Messages, 1)
	assert.Equal(t, "Reply OK", claudeReq.Messages[0].Content)
}

func TestExecuteQueuedProbesDefersBusyChannel(t *testing.T) {
	channelUserActivity.Delete(901)
	channelUserActivity.Delete(902)
	defer func() {
		channelUserActivity.Delete(901)
		channelUserActivity.Delete(902)
	}()

	// Simulate an active user call on channel 901 that exceeds maxDeferSec
	finishActive := markChannelUserRequestStart(901)
	defer finishActive()

	items := []resolvedProbeItem{
		{Key: "901:gpt-4o", ChannelID: 901, ModelName: "gpt-4o", Prompt: "hi"},
		{Key: "902:claude-sonnet", ChannelID: 902, ModelName: "claude-sonnet", Prompt: "hi"},
	}

	opts := console_setting.ChannelProbeOptions{
		TimeoutSeconds:    10,
		QueueDelayMs:      0,
		UserBusyWindowSec: 10,
		MaxDeferSec:       0, // Immediately defer busy channel so test stays deterministic & fast
	}

	var executedOrder []string
	summary, updates := executeQueuedProbes(
		context.Background(),
		items,
		opts,
		true,
		func(_ context.Context, item resolvedProbeItem) ProbeHeartbeat {
			executedOrder = append(executedOrder, item.Key)
			return ProbeHeartbeat{Timestamp: time.Now().Unix(), Success: true, LatencyMs: 120}
		},
		nil,
	)

	assert.Equal(t, []string{"902:claude-sonnet"}, executedOrder)
	assert.Equal(t, 2, summary.Total)
	assert.Equal(t, 1, summary.Succeeded)
	assert.Equal(t, 0, summary.Failed)
	assert.Equal(t, 1, summary.Deferred)
	assert.Contains(t, updates, "902:claude-sonnet")
	assert.NotContains(t, updates, "901:gpt-4o")
}
