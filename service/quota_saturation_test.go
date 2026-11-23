package service

import (
	"encoding/binary"
	"math"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	hostdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	hosttypes "github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAttachQuotaSaturationNestsUnderAdminInfo verifies the saturation marker
// is nested under other.admin_info.quota_saturation so it is admin-only (the
// log formatter strips admin_info for non-admin viewers).
func TestAttachQuotaSaturationNestsUnderAdminInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)

	relayInfo := &relaycommon.RelayInfo{
		UserId:          7,
		OriginModelName: "gpt-image-1",
		QuotaClamp: &common.QuotaClamp{
			Op:       "QuotaFromDecimal",
			Kind:     common.QuotaClampOverflow,
			Original: 1.8e19,
			Clamped:  common.MaxQuota,
		},
	}

	other := model.NewLogOther()
	other.SetPublic("model_price", 0.004)
	attachQuotaSaturation(ctx, relayInfo, other)

	adminInfo, ok := other.Snapshot()["admin_info"].(map[string]any)
	require.True(t, ok, "admin_info should be created")
	sat, ok := adminInfo["quota_saturation"].(map[string]any)
	require.True(t, ok, "quota_saturation should be nested under admin_info")
	require.Equal(t, "QuotaFromDecimal", sat["op"])
	require.Equal(t, common.QuotaClampOverflow, sat["kind"])
	require.Equal(t, common.MaxQuota, sat["clamped"])
}

func TestCalcViolationFeeQuotaSaturates(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500_000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	require.Equal(t, common.MaxQuota, calcViolationFeeQuota(1e20, 1))
}

func TestCalcOpenRouterCacheCreateTokensDoesNotWrap(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500_000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	got := CalcOpenRouterCacheCreateTokens(dto.Usage{Cost: math.Inf(1)}, hosttypes.PriceData{
		ModelRatio:         1,
		CacheCreationRatio: 2,
		CacheRatio:         1,
		CompletionRatio:    1,
	})
	require.Equal(t, -1, got)
}

// TestAttachQuotaSaturationPreservesExistingAdminInfo verifies the marker is
// merged into a pre-existing admin_info map without clobbering it.
func TestAttachQuotaSaturationPreservesExistingAdminInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)

	relayInfo := &relaycommon.RelayInfo{
		QuotaClamp: &common.QuotaClamp{Op: "QuotaFromFloat", Kind: common.QuotaClampUnderflow, Clamped: common.MinQuota},
	}
	other := model.NewLogOther()
	other.SetAdmin("admin_username", "root")
	attachQuotaSaturation(ctx, relayInfo, other)

	adminInfo := other.Snapshot()["admin_info"].(map[string]any)
	require.Equal(t, "root", adminInfo["admin_username"], "existing admin_info fields preserved")
	require.NotNil(t, adminInfo["quota_saturation"])
}

// TestAttachQuotaSaturationNoClampNoMarker verifies the common case (no
// saturation) leaves the log untouched.
func TestAttachQuotaSaturationNoClampNoMarker(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)

	relayInfo := &relaycommon.RelayInfo{QuotaClamp: nil}
	other := model.NewLogOther()
	other.SetPublic("model_price", 0.004)
	attachQuotaSaturation(ctx, relayInfo, other)

	_, hasAdmin := other.Snapshot()["admin_info"]
	require.False(t, hasAdmin, "no admin_info should be added when there is no clamp")
}

func TestPreConsumeBillingRejectsSaturatedQuotaBeforeDeduction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		QuotaClamp: &common.QuotaClamp{
			Op:       "QuotaFromFloat",
			Kind:     common.QuotaClampOverflow,
			Original: 1e30,
			Clamped:  common.MaxQuota,
		},
	}

	apiErr := PreConsumeBilling(c, common.MaxQuota, info)

	require.NotNil(t, apiErr)
	require.Equal(t, types.ErrorCodeModelPriceError, apiErr.GetErrorCode())
	require.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
	require.Same(t, info.QuotaClamp, apiErr.Err)
	var clamp *common.QuotaClamp
	require.ErrorAs(t, apiErr, &clamp)
	require.Same(t, info.QuotaClamp, clamp)
	require.Nil(t, info.Billing)
}

func TestPreConsumeBillingRejectsNegativeQuotaBeforeDeduction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{}

	apiErr := PreConsumeBilling(c, -1, info)

	require.NotNil(t, apiErr)
	require.Equal(t, types.ErrorCodeModelPriceError, apiErr.GetErrorCode())
	require.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
	require.Nil(t, info.Billing)
}

func TestAudioUsePriceTrustQuotaMidjourneyAndHEIFRegressions(t *testing.T) {
	t.Run("calculateAudioQuota uses ModelPrice when UsePrice is enabled", func(t *testing.T) {
		oldQuotaPerUnit := common.QuotaPerUnit
		common.QuotaPerUnit = 500_000
		t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

		quota, clamp := calculateAudioQuota(QuotaInfo{
			ModelName:  "tts-fixed",
			UsePrice:   true,
			ModelPrice: 0.05,
			GroupRatio: 2,
		})
		require.Nil(t, clamp)
		assert.Equal(t, 50_000, quota)
	})

	t.Run("tryAcquireTrustedInFlight caps concurrent unreserved quota and count", func(t *testing.T) {
		const userID = 99001
		const tokenID = 99002
		const trustQuota = 500_000.0
		const userQuota = 650_000
		const tokenQuota = 650_000

		held1, ok := tryAcquireTrustedInFlight(userID, tokenID, false, userQuota, tokenQuota, 100_000, trustQuota)
		require.True(t, ok)
		assert.Equal(t, 100_000, held1)

		// Remaining unreserved margin above trustQuota is now 50,000, so another 100,000 request must fall back to pre-consume.
		_, ok = tryAcquireTrustedInFlight(userID, tokenID, false, userQuota, tokenQuota, 100_000, trustQuota)
		assert.False(t, ok)

		releaseTrustedInFlight(userID, tokenID, false, held1)

		// After release, trust fast-path is available again.
		held2, ok := tryAcquireTrustedInFlight(userID, tokenID, false, userQuota, tokenQuota, 100_000, trustQuota)
		require.True(t, ok)
		releaseTrustedInFlight(userID, tokenID, false, held2)
	})

	t.Run("CoverPlusActionToNormalAction rejects truncated customId without panic", func(t *testing.T) {
		for _, malformed := range []string{"MJ", "MJ::JOB", "MJ::JOB::upsample", "MJ::variation"} {
			req := &hostdto.MidjourneyRequest{CustomId: malformed}
			require.NotPanics(t, func() {
				resp := CoverPlusActionToNormalAction(req)
				require.NotNil(t, resp)
			})
		}
	})

	t.Run("parseHEIFDimensions rejects overflowing 64-bit boxSize without panic", func(t *testing.T) {
		// Minimal ftyp box ("heic") followed by a meta box claiming extended 64-bit size 0xFFFFFFFFFFFFFFFF.
		data := make([]byte, 32)
		binary.BigEndian.PutUint32(data[0:4], 16)
		copy(data[4:8], "ftyp")
		copy(data[8:12], "heic")
		binary.BigEndian.PutUint32(data[16:20], 1) // 64-bit extended size indicator
		copy(data[20:24], "meta")
		binary.BigEndian.PutUint64(data[24:32], math.MaxUint64)

		require.NotPanics(t, func() {
			w, h, ok := parseHEIFDimensions(data)
			assert.False(t, ok)
			assert.Zero(t, w)
			assert.Zero(t, h)
		})
	})
}
