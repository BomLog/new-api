package claudemessages

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Claude 客户端（Claude Code / Hermes 等）在 thinking 模式下会把思考内容放在
// assistant 消息的 thinking block 里。转换为 OpenAI Chat Completions 时必须把
// thinking 文本映射到 reasoning_content，否则 DeepSeek 等 thinking 模式上游会以
// "reasoning_content in the thinking mode must be passed back to the API" 拒绝请求。
func TestClaudeMessagesRequestToOpenAIChat_PreservesThinkingAsReasoningContent(t *testing.T) {
	var req dto.ClaudeRequest
	err := json.Unmarshal([]byte(`{
		"model": "deepseek-v4-pro",
		"max_tokens": 1024,
		"messages": [
			{"role": "user", "content": "What is the weather?"},
			{"role": "assistant", "content": [
				{"type": "thinking", "thinking": "Let me look up the weather.", "signature": "sig"},
				{"type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": {"city": "Paris"}}
			]},
			{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "15 degrees"}]}
		],
		"tools": [{"name": "get_weather", "description": "Get weather", "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}}}]
	}`), &req)
	require.NoError(t, err)

	got, err := ClaudeMessagesRequestToOpenAIChat(req, nil)
	require.NoError(t, err)

	var assistant *dto.Message
	for i := range got.Messages {
		if got.Messages[i].Role == "assistant" {
			assistant = &got.Messages[i]
		}
	}
	require.NotNil(t, assistant, "assistant message must be preserved")
	assert.Equal(t, "Let me look up the weather.", assistant.GetReasoningContent())
	require.NotNil(t, assistant.ToolCalls)
	assert.Len(t, assistant.ParseToolCalls(), 1)
}

// 纯 thinking + text 的 assistant 消息（无工具调用）同样不能丢思考内容。
func TestClaudeMessagesRequestToOpenAIChat_PreservesThinkingWithTextContent(t *testing.T) {
	var req dto.ClaudeRequest
	err := json.Unmarshal([]byte(`{
		"model": "deepseek-v4-pro",
		"max_tokens": 1024,
		"messages": [
			{"role": "user", "content": "Hello"},
			{"role": "assistant", "content": [
				{"type": "thinking", "thinking": "The user greeted me.", "signature": "sig"},
				{"type": "text", "text": "Hi there!"}
			]}
		]
	}`), &req)
	require.NoError(t, err)

	got, err := ClaudeMessagesRequestToOpenAIChat(req, nil)
	require.NoError(t, err)

	var assistant *dto.Message
	for i := range got.Messages {
		if got.Messages[i].Role == "assistant" {
			assistant = &got.Messages[i]
		}
	}
	require.NotNil(t, assistant, "assistant message must be preserved")
	assert.Equal(t, "The user greeted me.", assistant.GetReasoningContent())
	parts := assistant.ParseContent()
	require.NotEmpty(t, parts, "assistant text content must be preserved")
	assert.Equal(t, "Hi there!", parts[0].Text)
}
