package relay

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relay/channel/claude"
	"github.com/QuantumNous/new-api/relay/channel/gemini"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestResponseModelComparisonAndLog(t *testing.T) {
	for _, tc := range []struct {
		name     string
		models   []string
		returned string
		mismatch bool
	}{
		{name: "absent", models: []string{"", "  "}},
		{name: "requested model", models: []string{"requested"}, returned: "requested"},
		{name: "mapped model", models: []string{"mapped"}, returned: "mapped"},
		{name: "different model", models: []string{"other"}, returned: "other", mismatch: true},
		{name: "case differs", models: []string{"Requested"}, returned: "Requested"},
		{name: "requested prefix", models: []string{"requested-2026-09-01"}, returned: "requested-2026-09-01"},
		{name: "mapped case differs", models: []string{"MAPPED"}, returned: "MAPPED"},
		{name: "mapped prefix", models: []string{"mapped-2026-09-01"}, returned: "mapped-2026-09-01"},
		{name: "reverse prefix still warns", models: []string{"request"}, returned: "request", mismatch: true},
		{name: "suffix", models: []string{"other-requested"}, returned: "other-requested"},
		{name: "provider path", models: []string{"vendor/requested"}, returned: "vendor/requested"},
		{name: "provider path case differs", models: []string{"vendor/REQUESTED"}, returned: "vendor/REQUESTED"},
		{name: "provider path with dated mapped model", models: []string{"vendor/mapped-2026-09-01"}, returned: "vendor/mapped-2026-09-01", mismatch: true},
		{name: "nested provider path", models: []string{"accounts/vendor/models/requested"}, returned: "accounts/vendor/models/requested"},
		{name: "provider path reverse prefix still warns", models: []string{"vendor/request"}, returned: "vendor/request", mismatch: true},
		{name: "provider path other model still warns", models: []string{"vendor/other"}, returned: "vendor/other", mismatch: true},
		{name: "provider path only still warns", models: []string{"vendor/"}, returned: "vendor/", mismatch: true},
		{name: "compatible difference survives matching frames", models: []string{"mapped", "Requested", "", "requested"}, returned: "Requested"},
		{name: "warning supersedes compatible difference", models: []string{"Requested", "other"}, returned: "other", mismatch: true},
		{name: "compatible difference cannot erase warning", models: []string{"other", "Requested"}, returned: "other", mismatch: true},
		{name: "mismatch survives later frames", models: []string{"mapped", "other", "", "requested"}, returned: "other", mismatch: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			info := &relaycommon.RelayInfo{
				OriginModelName: "requested",
				ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: "mapped", IsModelMapped: true},
			}
			for _, name := range tc.models {
				info.ObserveResponseModel(name)
			}
			other := service.GenerateTextOtherInfo(c, info, 1, 1, 1, 0, 0, 0, 1)
			var stored struct {
				ResponseModel *relaycommon.ResponseModel `json:"response_model"`
			}
			require.NoError(t, common.UnmarshalJsonStr(other.JSONString(), &stored))
			if tc.returned == "" {
				assert.Nil(t, stored.ResponseModel)
				return
			}
			require.NotNil(t, stored.ResponseModel)
			assert.Equal(t, &relaycommon.ResponseModel{
				RequestedModel: "requested", UpstreamModel: "mapped", ReturnedModel: tc.returned,
			}, stored.ResponseModel)
			assert.NotContains(t, other.JSONString(), "mismatch")
			assert.Equal(t, tc.mismatch, stored.ResponseModel.Mismatch())
			assert.Equal(t, "mapped", info.UpstreamModelName)
		})
	}
}

func TestResponseModelLogOmitsUnchangedModel(t *testing.T) {
	for _, tc := range []struct {
		name     string
		upstream string
		returned string
		mapped   bool
		record   bool
	}{
		{name: "same model", upstream: "requested", returned: "requested"},
		{name: "no upstream name", returned: "requested"},
		{name: "mapped model", upstream: "mapped", returned: "mapped", mapped: true, record: true},
		{name: "mapped response echoes request", upstream: "mapped", returned: "requested", mapped: true, record: true},
		{name: "prefix difference", upstream: "requested", returned: "requested-2026-09-01", record: true},
		{name: "case difference", upstream: "requested", returned: "REQUESTED", record: true},
		{name: "mismatch", upstream: "requested", returned: "other", record: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			info := &relaycommon.RelayInfo{
				OriginModelName: "requested",
				ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: tc.upstream, IsModelMapped: tc.mapped},
			}
			info.ObserveResponseModel(tc.returned)
			other := service.GenerateTextOtherInfo(c, info, 1, 1, 1, 0, 0, 0, 1)
			require.NotNil(t, info.ResponseModel)
			assert.Equal(t, float64(1), other.Snapshot()["model_ratio"])
			if tc.record {
				assert.Equal(t, *info.ResponseModel, other.Snapshot()["response_model"])
			} else {
				assert.NotContains(t, other.Snapshot(), "response_model")
			}
		})
	}
}

func TestResponseModelEmptyExpectedNamesDoNotMatchEveryPrefix(t *testing.T) {
	for _, tc := range []struct{ requested, upstream string }{
		{}, {upstream: "mapped"}, {requested: "requested"},
	} {
		t.Run(tc.requested+"/"+tc.upstream, func(t *testing.T) {
			info := &relaycommon.RelayInfo{
				OriginModelName: tc.requested,
				ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: tc.upstream},
			}
			info.ObserveResponseModel("other")
			require.NotNil(t, info.ResponseModel)
			assert.True(t, info.ResponseModel.Mismatch())
		})
	}
}

func TestResponseModelExpectedProviderPath(t *testing.T) {
	for _, tc := range []struct {
		name      string
		requested string
		upstream  string
		returned  string
		mismatch  bool
	}{
		{name: "requested carries provider path", requested: "vendor/requested", returned: "requested", mismatch: true},
		{name: "same provider path on both sides", requested: "vendor/requested", returned: "vendor/requested-2026-09-01"},
		{name: "provider path alone does not match", requested: "vendor/requested", returned: "vendor", mismatch: true},
		{name: "different model behind same provider still warns", requested: "vendor/requested", returned: "vendor/other", mismatch: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			info := &relaycommon.RelayInfo{
				OriginModelName: tc.requested,
				ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: tc.upstream},
			}
			info.ObserveResponseModel(tc.returned)
			require.NotNil(t, info.ResponseModel)
			assert.Equal(t, tc.returned, info.ResponseModel.ReturnedModel)
			assert.Equal(t, tc.mismatch, info.ResponseModel.Mismatch())
		})
	}
}

func TestResponseModelRetryResetsObservation(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(c, constant.ContextKeyOriginalModel, "requested")
	info := &relaycommon.RelayInfo{OriginModelName: "requested"}
	info.InitChannelMeta(c)
	info.ObserveResponseModel("other")
	require.True(t, info.ResponseModel.Mismatch())
	info.InitChannelMeta(c)
	assert.Nil(t, info.ResponseModel)
	info.ObserveResponseModel("requested")
	assert.False(t, info.ResponseModel.Mismatch())
}

func TestResponseModelHandlersCaptureBeforeConversion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	chat := `{"id":"chat_1","model":"returned","choices":[{"index":0,"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}`
	chatStream := "data: " + `{"id":"chat_1","model":"returned","choices":[{"index":0,"delta":{"role":"assistant","content":"hello"}}]}` + "\n\ndata: " + `{"id":"chat_1","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}` + "\n\ndata: [DONE]\n\n"
	responses := `{"id":"resp_1","model":"returned","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}`
	responsesStream := "data: " + `{"type":"response.created","response":{"id":"resp_1","model":"returned"}}` + "\n\ndata: " + `{"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}` + "\n\n"
	claudeBody := `{"id":"msg_1","type":"message","model":"returned","role":"assistant","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":2,"output_tokens":3}}`
	claudeStream := "data: " + `{"type":"message_start","message":{"id":"msg_1","type":"message","model":"returned","role":"assistant","content":[],"usage":{"input_tokens":2,"output_tokens":0}}}` + "\n\ndata: " + `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}` + "\n\ndata: " + `{"type":"message_stop"}` + "\n\n"
	geminiBody := `{"modelVersion":"returned","candidates":[{"content":{"role":"model","parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"totalTokenCount":5}}`
	geminiStream := "data: " + geminiBody + "\n\n"
	for _, tc := range []struct {
		name    string
		body    string
		format  types.RelayFormat
		stream  bool
		handler func(*gin.Context, *relaycommon.RelayInfo, *http.Response) (*dto.Usage, *types.NewAPIError)
	}{
		{"chat", chat, types.RelayFormatOpenAI, false, openai.OpenaiHandler},
		{"chat stream", chatStream, types.RelayFormatOpenAI, true, openai.OaiStreamHandler},
		{"responses", responses, types.RelayFormatOpenAIResponses, false, openai.OaiResponsesHandler},
		{"responses stream", responsesStream, types.RelayFormatOpenAIResponses, true, openai.OaiResponsesStreamHandler},
		{"responses to chat", responses, types.RelayFormatOpenAI, false, openai.OaiResponsesToChatHandler},
		{"responses to chat stream", responsesStream, types.RelayFormatOpenAI, true, openai.OaiResponsesToChatStreamHandler},
		{"responses buffered to chat", responsesStream, types.RelayFormatOpenAI, false, openai.OaiResponsesToChatBufferedStreamHandler},
		{"chat to responses", chat, types.RelayFormatOpenAIResponses, false, openai.OaiChatToResponsesHandler},
		{"chat to responses stream", chatStream, types.RelayFormatOpenAIResponses, true, openai.OaiChatToResponsesStreamHandler},
		{"claude", claudeBody, types.RelayFormatClaude, false, func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
			return claude.ClaudeHandler(c, resp, info)
		}},
		{"claude stream", claudeStream, types.RelayFormatClaude, true, func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
			return claude.ClaudeStreamHandler(c, resp, info)
		}},
		{"claude to responses stream", claudeStream, types.RelayFormatOpenAIResponses, true, func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
			return claude.ClaudeResponsesStreamHandler(c, resp, info)
		}},
		{"gemini", geminiBody, types.RelayFormatGemini, false, gemini.GeminiTextGenerationHandler},
		{"gemini stream", geminiStream, types.RelayFormatGemini, true, gemini.GeminiTextGenerationStreamHandler},
		{"gemini to chat", geminiBody, types.RelayFormatOpenAI, false, gemini.GeminiChatHandler},
		{"gemini to responses", geminiBody, types.RelayFormatOpenAIResponses, false, gemini.GeminiResponsesHandler},
		{"gemini to responses stream", geminiStream, types.RelayFormatOpenAIResponses, true, gemini.GeminiResponsesStreamHandler},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
			info := &relaycommon.RelayInfo{
				OriginModelName: "requested", RelayFormat: tc.format, RelayMode: relayconstant.RelayModeChatCompletions,
				IsStream: tc.stream, DisablePing: true, StartTime: time.Now(),
				ChannelMeta:         &relaycommon.ChannelMeta{UpstreamModelName: "mapped"},
				ThinkingContentInfo: relaycommon.ThinkingContentInfo{IsFirstThinkingContent: true},
			}
			usage, apiErr := tc.handler(c, info, &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))})
			require.Nil(t, apiErr)
			require.NotNil(t, usage)
			assert.Equal(t, 5, usage.TotalTokens)
			require.NotNil(t, info.ResponseModel)
			assert.Equal(t, &relaycommon.ResponseModel{RequestedModel: "requested", UpstreamModel: "mapped", ReturnedModel: "returned"}, info.ResponseModel)
			assert.True(t, info.ResponseModel.Mismatch())
			other := service.GenerateTextOtherInfo(c, info, 1, 1, 1, 0, 0, 0, 1)
			assert.Equal(t, *info.ResponseModel, other.Snapshot()["response_model"])
		})
	}
}

func TestResponseModelSharedResponsesAccumulator(t *testing.T) {
	// WebSocket turns and HTTP SSE use this same accumulator. A model-free
	// terminal must not erase the model declared before an interrupted stream.
	info := &relaycommon.RelayInfo{OriginModelName: "requested", ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "mapped"}}
	accumulator := service.NewResponsesUsageAccumulator(info)
	accumulator.Observe(&dto.ResponsesStreamResponse{Type: "response.created", Response: &dto.OpenAIResponsesResponse{Model: "returned"}}, nil)
	accumulator.Observe(&dto.ResponsesStreamResponse{Type: "response.failed", Response: &dto.OpenAIResponsesResponse{Usage: &dto.Usage{InputTokens: 2, OutputTokens: 3}}}, nil)
	assert.Equal(t, 5, accumulator.Finish().TotalTokens)
	require.NotNil(t, info.ResponseModel)
	assert.True(t, info.ResponseModel.Mismatch())
	assert.Equal(t, "returned", info.ResponseModel.ReturnedModel)
}

func TestResponseModelDoesNotRecordSynthesizedModel(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "requested", RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "mapped"},
	}
	_, apiErr := openai.OaiResponsesToChatBufferedStreamHandler(c, info, &http.Response{
		StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("data: [DONE]\n\n")),
	})
	require.Nil(t, apiErr)
	assert.Nil(t, info.ResponseModel)
}

type errAfterReader struct {
	prefix string
	offset int
	err    error
}

func (r *errAfterReader) Read(p []byte) (int, error) {
	if r.offset < len(r.prefix) {
		n := copy(p, r.prefix[r.offset:])
		r.offset += n
		return n, nil
	}
	return 0, r.err
}

func (r *errAfterReader) Close() error {
	return nil
}

func TestEmptyResponseAndUpstreamStreamErrorWaiveBillingAndRefundReservation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })

	previousQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500 * 1000
	t.Cleanup(func() { common.QuotaPerUnit = previousQuotaPerUnit })

	previousRedis := common.RedisEnabled
	previousMemoryCache := common.MemoryCacheEnabled
	common.RedisEnabled = false
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = previousRedis
		common.MemoryCacheEnabled = previousMemoryCache
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })

	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldMainType, oldLogType)
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Channel{}, &model.Log{}))

	operation_setting.SetToolPriceForTest(dto.BuildInToolWebSearchPreview, 10)
	t.Cleanup(func() { operation_setting.DeleteToolPriceForTest(dto.BuildInToolWebSearchPreview) })

	const startingQuota = 1_000_000
	http2InternalErr := errors.New("stream error: stream ID 1; INTERNAL_ERROR; received from peer")

	for index, tc := range []struct {
		name               string
		expression         string
		estimate           int
		format             types.RelayFormat
		mode               int
		stream             bool
		inferredSearchTool bool
		newBody            func() io.ReadCloser
		handler            func(*gin.Context, *relaycommon.RelayInfo, *http.Response) (*dto.Usage, *types.NewAPIError)
		wantQuota          int
		wantStreamStatus   string
		wantEndReason      string
	}{
		{
			name:       "claude stream HTTP/2 INTERNAL_ERROR before message_start waives estimated billing and refunds",
			expression: `tier("base", p * 3 + c * 15)`,
			estimate:   1000,
			format:     types.RelayFormatClaude,
			mode:       relayconstant.RelayModeUnknown,
			stream:     true,
			newBody: func() io.ReadCloser {
				return &errAfterReader{err: http2InternalErr}
			},
			handler: func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
				return claude.ClaudeStreamHandler(c, resp, info)
			},
			wantQuota:        0,
			wantStreamStatus: "error",
			wantEndReason:    "scanner_error",
		},
		{
			name:       "claude stream HTTP/2 INTERNAL_ERROR after message_start without output waives billing and refunds",
			expression: `tier("base", p * 3 + cc * 4 + c * 15)`,
			estimate:   1000,
			format:     types.RelayFormatClaude,
			mode:       relayconstant.RelayModeUnknown,
			stream:     true,
			newBody: func() io.ReadCloser {
				return &errAfterReader{
					prefix: "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"model\":\"claude-sonnet-4-5\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":120,\"cache_creation_input_tokens\":80,\"output_tokens\":0}}}\n\n",
					err:    http2InternalErr,
				}
			},
			handler: func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
				return claude.ClaudeStreamHandler(c, resp, info)
			},
			wantQuota:        0,
			wantStreamStatus: "error",
			wantEndReason:    "scanner_error",
		},
		{
			name:       "claude stream completed refusal with upstream cache tokens still bills upstream usage",
			expression: `tier("base", p * 3 + cc * 4 + c * 15)`,
			estimate:   1000,
			format:     types.RelayFormatClaude,
			mode:       relayconstant.RelayModeUnknown,
			stream:     true,
			newBody: func() io.ReadCloser {
				return io.NopCloser(strings.NewReader(
					"data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_refusal\",\"type\":\"message\",\"model\":\"claude-sonnet-4-5\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":0,\"cache_creation_input_tokens\":1000,\"output_tokens\":0}}}\n\n" +
						"data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"refusal\"},\"usage\":{\"output_tokens\":0}}\n\n" +
						"data: {\"type\":\"message_stop\"}\n\n",
				))
			},
			handler: func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
				return claude.ClaudeStreamHandler(c, resp, info)
			},
			wantQuota:        2000,
			wantStreamStatus: "ok",
			wantEndReason:    "eof",
		},
		{
			name:               "claude non-stream empty response without upstream usage waives fixed price and inferred search surcharge",
			expression:         `tier("request", fixed(0.01))`,
			estimate:           1000,
			format:             types.RelayFormatClaude,
			mode:               relayconstant.RelayModeUnknown,
			stream:             false,
			inferredSearchTool: true,
			newBody: func() io.ReadCloser {
				return io.NopCloser(strings.NewReader(`{"id":"msg_empty","type":"message","model":"claude-sonnet-4-5","role":"assistant","content":[],"stop_reason":"end_turn","usage":{"input_tokens":0,"output_tokens":0}}`))
			},
			handler: func(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
				return claude.ClaudeHandler(c, resp, info)
			},
			wantQuota: 0,
		},
		{
			name:       "openai chat stream HTTP/2 INTERNAL_ERROR without output waives estimated billing and refunds",
			expression: `tier("base", p * 2 + c * 8)`,
			estimate:   1000,
			format:     types.RelayFormatOpenAI,
			mode:       relayconstant.RelayModeChatCompletions,
			stream:     true,
			newBody: func() io.ReadCloser {
				return &errAfterReader{
					prefix: "data: {\"id\":\"chat_1\",\"model\":\"gpt-5\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"}}]}\n\n",
					err:    http2InternalErr,
				}
			},
			handler:          openai.OaiStreamHandler,
			wantQuota:        0,
			wantStreamStatus: "error",
			wantEndReason:    "scanner_error",
		},
		{
			name:       "openai chat non-stream empty message without upstream usage waives billing and refunds",
			expression: `tier("base", p * 2 + c * 8)`,
			estimate:   1000,
			format:     types.RelayFormatOpenAI,
			mode:       relayconstant.RelayModeChatCompletions,
			stream:     false,
			newBody: func() io.ReadCloser {
				return io.NopCloser(strings.NewReader(`{"id":"chat_empty","model":"gpt-5","choices":[{"index":0,"message":{"role":"assistant","content":""},"finish_reason":"stop"}]}`))
			},
			handler:   openai.OpenaiHandler,
			wantQuota: 0,
		},
		{
			name:       "openai chat non-stream empty message with explicit upstream usage bills upstream tokens",
			expression: `tier("base", p * 2 + c * 8)`,
			estimate:   500,
			format:     types.RelayFormatOpenAI,
			mode:       relayconstant.RelayModeChatCompletions,
			stream:     false,
			newBody: func() io.ReadCloser {
				return io.NopCloser(strings.NewReader(`{"id":"chat_billed","model":"gpt-5","choices":[{"index":0,"message":{"role":"assistant","content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":0,"total_tokens":1000}}`))
			},
			handler:   openai.OpenaiHandler,
			wantQuota: 1000,
		},
		{
			name:       "openai responses stream HTTP/2 INTERNAL_ERROR after response.created waives estimated billing and refunds",
			expression: `tier("base", p * 2 + c * 8)`,
			estimate:   1000,
			format:     types.RelayFormatOpenAIResponses,
			mode:       relayconstant.RelayModeResponses,
			stream:     true,
			newBody: func() io.ReadCloser {
				return &errAfterReader{
					prefix: "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_1\",\"model\":\"gpt-5\"}}\n\n",
					err:    http2InternalErr,
				}
			},
			handler:          openai.OaiResponsesStreamHandler,
			wantQuota:        0,
			wantStreamStatus: "error",
			wantEndReason:    "scanner_error",
		},
		{
			name:       "gemini stream empty candidate frame followed by HTTP/2 INTERNAL_ERROR waives estimated billing",
			expression: `tier("base", p * 2 + c * 8)`,
			estimate:   1000,
			format:     types.RelayFormatGemini,
			mode:       relayconstant.RelayModeGemini,
			stream:     true,
			newBody: func() io.ReadCloser {
				return &errAfterReader{
					prefix: "data: {\"modelVersion\":\"gemini-2.5-pro\",\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[]}}]}\n\n",
					err:    http2InternalErr,
				}
			},
			handler:          gemini.GeminiTextGenerationStreamHandler,
			wantQuota:        0,
			wantStreamStatus: "error",
			wantEndReason:    "scanner_error",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			user := model.User{
				Username: fmt.Sprintf("empty_resp_user_%d", index),
				AffCode:  fmt.Sprintf("empty_aff_%d", index),
				Quota:    startingQuota,
				Status:   common.UserStatusEnabled,
			}
			require.NoError(t, db.Create(&user).Error)
			token := model.Token{
				UserId:      user.Id,
				Key:         fmt.Sprintf("empty-resp-token-%d", index),
				Name:        "empty-resp",
				RemainQuota: startingQuota,
				Status:      common.TokenStatusEnabled,
			}
			require.NoError(t, db.Create(&token).Error)
			channel := model.Channel{
				Name:   fmt.Sprintf("empty-resp-chan-%d", index),
				Key:    "unused",
				Status: common.ChannelStatusEnabled,
			}
			require.NoError(t, db.Create(&channel).Error)

			request := &billingexpr.RequestInput{Body: []byte(`{}`)}
			cost, trace, err := billingexpr.RunExprWithRequest(
				tc.expression,
				billingexpr.TokenParams{P: float64(tc.estimate), Len: float64(tc.estimate)},
				*request,
			)
			require.NoError(t, err)
			reservation, err := billingexpr.QuotaRoundStrict(cost / 1_000_000 * common.QuotaPerUnit)
			require.NoError(t, err)
			require.Greater(t, reservation, 0)

			snapshot := &billingexpr.BillingSnapshot{
				BillingMode:              "tiered_expr",
				ExprString:               tc.expression,
				ExprHash:                 billingexpr.ExprHashString(tc.expression),
				QuotaPerUnit:             common.QuotaPerUnit,
				GroupRatio:               1,
				EstimatedTier:            trace.MatchedTier,
				EstimatedBillingUnit:     trace.BillingUnit,
				EstimatedFixedPrice:      trace.FixedPrice,
				EstimatedQuotaAfterGroup: reservation,
			}
			info := &relaycommon.RelayInfo{
				UserId:                user.Id,
				TokenId:               token.Id,
				TokenKey:              token.Key,
				OriginModelName:       "test-model",
				UsingGroup:            "default",
				UserGroup:             "default",
				UserSetting:           dto.UserSetting{BillingPreference: "wallet_only"},
				ForcePreConsume:       true,
				StartTime:             time.Now(),
				IsStream:              tc.stream,
				DisablePing:           true,
				RelayFormat:           tc.format,
				RelayMode:             tc.mode,
				ChannelMeta:           &relaycommon.ChannelMeta{ChannelId: channel.Id, UpstreamModelName: "test-model"},
				ThinkingContentInfo:   relaycommon.ThinkingContentInfo{IsFirstThinkingContent: true},
				PriceData:             hosttypes.PriceData{ModelRatio: 1, CompletionRatio: 1, GroupRatioInfo: hosttypes.GroupRatioInfo{GroupRatio: 1}},
				TieredBillingSnapshot: snapshot,
				BillingRequestInput:   request,
			}
			info.SetEstimatePromptTokens(tc.estimate)
			if tc.inferredSearchTool {
				info.RecordRequestInferredToolCall(dto.BuildInToolWebSearchPreview)
			}

			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
			c.Set("use_channel", []string{fmt.Sprintf("%d", channel.Id)})

			apiErr := service.PreConsumeBilling(c, reservation, info)
			require.Nil(t, apiErr)

			heldQuota, err := model.GetUserQuota(user.Id, true)
			require.NoError(t, err)
			assert.Equal(t, startingQuota-reservation, heldQuota)

			usage, handlerErr := tc.handler(c, info, &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       tc.newBody(),
			})
			require.Nil(t, handlerErr)

			service.PostTextConsumeQuota(c, info, usage, nil)

			var settledUser model.User
			require.NoError(t, db.First(&settledUser, user.Id).Error)
			var settledToken model.Token
			require.NoError(t, db.First(&settledToken, token.Id).Error)
			assert.Equal(t, startingQuota-tc.wantQuota, settledUser.Quota)
			assert.Equal(t, startingQuota-tc.wantQuota, settledToken.RemainQuota)
			assert.Equal(t, tc.wantQuota, settledUser.UsedQuota)
			assert.Equal(t, tc.wantQuota, settledToken.UsedQuota)

			var logEntry model.Log
			require.NoError(t, db.Where("user_id = ?", user.Id).Take(&logEntry).Error)
			assert.Equal(t, tc.wantQuota, logEntry.Quota)
			assert.NotContains(t, logEntry.Other, "billing-usage-anthropic-estimated")
			assert.NotContains(t, logEntry.Other, "billing-usage-gemini-estimated")
			if tc.wantQuota == 0 {
				assert.Contains(t, logEntry.Content, "Upstream returned no usage, so nothing was charged")
			} else {
				assert.NotContains(t, logEntry.Content, "nothing was charged")
			}
			if tc.wantStreamStatus != "" {
				var other map[string]any
				require.NoError(t, common.UnmarshalJsonStr(logEntry.Other, &other))
				streamStatus, ok := other["stream_status"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, tc.wantStreamStatus, streamStatus["status"])
				assert.Equal(t, tc.wantEndReason, streamStatus["end_reason"])
			}
		})
	}
}
