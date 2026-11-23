package model

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func insertUserForPaymentGuardTest(t *testing.T, id int, quota int) *User {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "payment_guard_user",
		Status:   common.UserStatusEnabled,
		Quota:    quota,
	}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func insertSubscriptionPlanForPaymentGuardTest(t *testing.T, id int) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:            id,
		Title:         "Guard Plan",
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertSubscriptionOrderForPaymentGuardTest(t *testing.T, tradeNo string, userID int, planID int, paymentProvider string) {
	t.Helper()
	order := &SubscriptionOrder{
		UserId:          userID,
		PlanId:          planID,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, order.Insert())
}

func insertTopUpForPaymentGuardTest(t *testing.T, tradeNo string, userID int, paymentProvider string) {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
}

func getTopUpStatusForPaymentGuardTest(t *testing.T, tradeNo string) string {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp.Status
}

func countUserSubscriptionsForPaymentGuardTest(t *testing.T, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userID).Count(&count).Error)
	return count
}

func getUserQuotaForPaymentGuardTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func TestRechargeWaffoPancake_RejectsMismatchedPaymentMethod(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 101, 0)
	insertTopUpForPaymentGuardTest(t, "waffo-pancake-guard", 101, PaymentProviderStripe)

	err := RechargeWaffoPancake("waffo-pancake-guard")
	require.Error(t, err)

	topUp := GetTopUpByTradeNo("waffo-pancake-guard")
	require.NotNil(t, topUp)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, 101))
}

func TestUpdatePendingTopUpStatus_RejectsMismatchedPaymentProvider(t *testing.T) {
	testCases := []struct {
		name                    string
		tradeNo                 string
		storedPaymentProvider   string
		expectedPaymentProvider string
		targetStatus            string
	}{
		{
			name:                    "stripe expire",
			tradeNo:                 "stripe-expire-guard",
			storedPaymentProvider:   PaymentProviderCreem,
			expectedPaymentProvider: PaymentProviderStripe,
			targetStatus:            common.TopUpStatusExpired,
		},
		{
			name:                    "waffo failed",
			tradeNo:                 "waffo-failed-guard",
			storedPaymentProvider:   PaymentProviderStripe,
			expectedPaymentProvider: PaymentProviderWaffo,
			targetStatus:            common.TopUpStatusFailed,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			insertUserForPaymentGuardTest(t, 150, 0)
			insertTopUpForPaymentGuardTest(t, tc.tradeNo, 150, tc.storedPaymentProvider)

			err := UpdatePendingTopUpStatus(tc.tradeNo, tc.expectedPaymentProvider, tc.targetStatus)
			require.ErrorIs(t, err, ErrPaymentMethodMismatch)
			assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, tc.tradeNo))
		})
	}
}

func TestCompleteSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 202, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 301)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-guard-order", 202, plan.Id, PaymentProviderStripe)

	err := CompleteSubscriptionOrder("sub-guard-order", `{"provider":"epay"}`, PaymentProviderEpay, "alipay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-guard-order")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, 202))

	topUp := GetTopUpByTradeNo("sub-guard-order")
	assert.Nil(t, topUp)
}

func TestExpireSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 303, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 401)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-expire-guard", 303, plan.Id, PaymentProviderStripe)

	err := ExpireSubscriptionOrder("sub-expire-guard", PaymentProviderCreem)
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-expire-guard")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func createEpayTestOrder(t *testing.T, userId int, tradeNo string, provider string, status string) TopUp {
	t.Helper()
	topUp := TopUp{
		UserId:          userId,
		Amount:          2,
		Money:           10.0,
		TradeNo:         tradeNo,
		PaymentMethod:   "alipay",
		PaymentProvider: provider,
		CreateTime:      common.GetTimestamp(),
		Status:          status,
	}
	require.NoError(t, DB.Create(&topUp).Error)
	return topUp
}

func TestRechargeEpayCreditsQuotaExactlyOnce(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 501, 0)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTONCE", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))

	reloaded := GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, reloaded)
	assert.Equal(t, common.TopUpStatusSuccess, reloaded.Status)
	assert.NotZero(t, reloaded.CompleteTime)

	alreadyDone, err = RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))
}

func TestRechargeEpayKeepsRedisAndDatabaseCreditInSync(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 5
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 502, 7)
	require.NoError(t, populateUserCache(*user))
	order := createEpayTestOrder(t, user.Id, "EPAYTESTREDISSYNC", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	assert.Equal(t, 17, getUserQuotaForPaymentGuardTest(t, user.Id))
	cached, err := cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)

	alreadyDone, err = RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)
	cached, err = cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)
}

func TestRechargeEpayUpdatesPaymentMethodToActual(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 503, 0)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTMETHOD", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)

	reloaded := GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, reloaded)
	assert.Equal(t, "wxpay", reloaded.PaymentMethod)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))
}

func TestRechargeEpayRejectsForeignAndNonPendingOrders(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 504, 7)

	t.Run("order from another payment provider", func(t *testing.T) {
		order := createEpayTestOrder(t, user.Id, "EPAYTESTSTRIPE", PaymentProviderStripe, common.TopUpStatusPending)
		_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrPaymentMethodMismatch)
		assert.Equal(t, 7, getUserQuotaForPaymentGuardTest(t, user.Id))
	})

	t.Run("order that is not pending", func(t *testing.T) {
		order := createEpayTestOrder(t, user.Id, "EPAYTESTEXPIRED", PaymentProviderEpay, common.TopUpStatusExpired)
		_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrTopUpStatusInvalid)
		assert.Equal(t, 7, getUserQuotaForPaymentGuardTest(t, user.Id))
	})

	t.Run("missing order", func(t *testing.T) {
		_, err := RechargeEpay("EPAYTESTMISSING", "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrTopUpNotFound)
	})
}

func TestRechargeEpayRejectsQuotaOverflowBeforeCompletingOrder(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = float64(common.MaxWalletQuota + 1)
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 505, 3)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTOVERFLOW", PaymentProviderEpay, common.TopUpStatusPending)

	_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.Error(t, err)
	assert.Equal(t, 3, getUserQuotaForPaymentGuardTest(t, user.Id))
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, order.TradeNo))
}

func TestRechargeEpayEnforcesFinalWalletQuotaLimit(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	testCases := []struct {
		name         string
		currentQuota int
		wantErr      bool
		wantQuota    int
		wantStatus   string
	}{
		{
			name:         "allows exact highest representable wallet balance",
			currentQuota: common.MaxWalletQuota - 1_000_000,
			wantQuota:    common.MaxWalletQuota,
			wantStatus:   common.TopUpStatusSuccess,
		},
		{
			name:         "rejects balance above wallet quota domain",
			currentQuota: common.MaxWalletQuota - 999_999,
			wantErr:      true,
			wantQuota:    common.MaxWalletQuota - 999_999,
			wantStatus:   common.TopUpStatusPending,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			user := insertUserForPaymentGuardTest(t, 506, tc.currentQuota)
			order := createEpayTestOrder(t, user.Id, "EPAYTESTWALLETLIMIT", PaymentProviderEpay, common.TopUpStatusPending)

			_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
			if tc.wantErr {
				require.ErrorIs(t, err, ErrTopUpQuotaLimitExceeded)
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, tc.wantQuota, getUserQuotaForPaymentGuardTest(t, user.Id))
			assert.Equal(t, tc.wantStatus, getTopUpStatusForPaymentGuardTest(t, order.TradeNo))
		})
	}
}

func TestRechargeAmountGuardsAndCreemPreservesEmptyEmail(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 601, 0)
	epayOrder := createEpayTestOrder(t, user.Id, "EPAY_UNDERPAID", PaymentProviderEpay, common.TopUpStatusPending)
	_, err := RechargeEpayWithAmount(epayOrder.TradeNo, "alipay", decimal.NewFromFloat(0.01), "127.0.0.1")
	require.ErrorIs(t, err, ErrPaymentAmountMismatch)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, user.Id))

	insertTopUpForPaymentGuardTest(t, "WAFFO_UNDERPAID", user.Id, PaymentProviderWaffo)
	err = RechargeWaffoWithAmount("WAFFO_UNDERPAID", decimal.NewFromFloat(0.01), "127.0.0.1")
	require.Error(t, err)
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, "WAFFO_UNDERPAID"))

	insertTopUpForPaymentGuardTest(t, "PANCAKE_UNDERPAID", user.Id, PaymentProviderWaffoPancake)
	err = RechargeWaffoPancakeWithAmount("PANCAKE_UNDERPAID", decimal.NewFromFloat(0.01))
	require.Error(t, err)
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, "PANCAKE_UNDERPAID"))

	plan := insertSubscriptionPlanForPaymentGuardTest(t, 602)
	insertSubscriptionOrderForPaymentGuardTest(t, "SUB_UNDERPAID", user.Id, plan.Id, PaymentProviderEpay)
	err = CompleteSubscriptionOrderWithAmount("SUB_UNDERPAID", `{}`, PaymentProviderEpay, "alipay", decimal.NewFromFloat(0.01))
	require.ErrorIs(t, err, ErrPaymentAmountMismatch)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, user.Id))

	creemTopUp := &TopUp{
		UserId:          user.Id,
		Amount:          1000,
		Money:           5.00,
		TradeNo:         "CREEM_NO_EMAIL_OVERWRITE",
		PaymentMethod:   PaymentMethodCreem,
		PaymentProvider: PaymentProviderCreem,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, creemTopUp.Insert())
	require.NoError(t, RechargeCreem(creemTopUp.TradeNo, "victim@example.com", "Attacker", "127.0.0.1"))
	assert.Equal(t, 1000, getUserQuotaForPaymentGuardTest(t, user.Id))

	var reloadedUser User
	require.NoError(t, DB.Where("id = ?", user.Id).First(&reloadedUser).Error)
	assert.Empty(t, reloadedUser.Email, "Creem callback must not overwrite unverified email onto user")
}

func TestRefundSubscriptionPreConsumeSingleConnAndAtomicSetup(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&Setup{}, &Option{}, &SubscriptionPreConsumeRecord{}))

	user := insertUserForPaymentGuardTest(t, 701, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 702)
	now := GetDBTimestamp()
	sub := &UserSubscription{
		UserId:      user.Id,
		PlanId:      plan.Id,
		AmountTotal: 1000,
		AmountUsed:  0,
		StartTime:   now - 60,
		EndTime:     now + 86400,
		Status:      "active",
		Source:      "admin",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	require.NoError(t, DB.Create(sub).Error)

	res, err := PreConsumeUserSubscription("req-refund-deadlock-check", user.Id, "gpt-4o", 0, 250)
	require.NoError(t, err)
	assert.Equal(t, int64(250), res.AmountUsedAfter)

	require.NoError(t, RefundSubscriptionPreConsume("req-refund-deadlock-check"))
	// Idempotent second call must also succeed without error or negative usage.
	require.NoError(t, RefundSubscriptionPreConsume("req-refund-deadlock-check"))

	var reloadedSub UserSubscription
	require.NoError(t, DB.Where("id = ?", sub.Id).First(&reloadedSub).Error)
	assert.Zero(t, reloadedSub.AmountUsed)

	// Verify CompleteInitialSetup claims Setup{ID: 1} atomically under concurrency.
	require.NoError(t, DB.Exec("DELETE FROM setups").Error)
	require.NoError(t, DB.Where("role = ?", common.RoleRootUser).Delete(&User{}).Error)

	const workers = 6
	var wg sync.WaitGroup
	successes := make(chan bool, workers)
	for i := range workers {
		wg.Go(func() {
			candidate := &User{
				Username:    "rootrace" + string(rune('a'+i)),
				Password:    "hashed",
				Role:        common.RoleRootUser,
				Status:      common.UserStatusEnabled,
				DisplayName: "Root",
			}
			_, setupErr := CompleteInitialSetup(candidate, true, false)
			successes <- (setupErr == nil)
		})
	}
	wg.Wait()
	close(successes)

	winCount := 0
	for ok := range successes {
		if ok {
			winCount++
		}
	}
	assert.Equal(t, 1, winCount, "exactly one concurrent CompleteInitialSetup must succeed")

	var rootCount int64
	require.NoError(t, DB.Model(&User{}).Where("role = ?", common.RoleRootUser).Count(&rootCount).Error)
	assert.Equal(t, int64(1), rootCount)
}

func TestPaymentSubscriptionAndSetupDatabaseMatrix(t *testing.T) {
	dialects := []struct {
		name common.DatabaseType
		env  string
	}{
		{name: common.DatabaseTypeSQLite, env: ""},
		{name: common.DatabaseTypeMySQL, env: "TEST_MYSQL_DSN"},
		{name: common.DatabaseTypePostgreSQL, env: "TEST_POSTGRES_DSN"},
	}

	for _, dialect := range dialects {
		t.Run(string(dialect.name), func(t *testing.T) {
			prefix := fmt.Sprintf("sec_fix_%d_", time.Now().UnixNano()%1_000_000)
			var driver gorm.Dialector
			maxConns := 8
			switch dialect.name {
			case common.DatabaseTypeSQLite:
				driver = sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", prefix))
				maxConns = 1
			case common.DatabaseTypeMySQL:
				dsn := strings.TrimSpace(os.Getenv(dialect.env))
				if dsn == "" {
					t.Skip(dialect.env + " is not configured")
				}
				driver = mysql.Open(dsn)
			case common.DatabaseTypePostgreSQL:
				dsn := strings.TrimSpace(os.Getenv(dialect.env))
				if dsn == "" {
					t.Skip(dialect.env + " is not configured")
				}
				driver = postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
			}

			db, err := gorm.Open(driver, &gorm.Config{
				NamingStrategy: schema.NamingStrategy{TablePrefix: prefix},
			})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(maxConns)

			versionQuery := "SELECT version()"
			if dialect.name == common.DatabaseTypeSQLite {
				versionQuery = "SELECT sqlite_version()"
			}
			var dbVersion string
			require.NoError(t, db.Raw(versionQuery).Scan(&dbVersion).Error)
			t.Logf("verified dialect=%s version=%s", dialect.name, dbVersion)

			modelsToMigrate := []any{
				&User{},
				&Option{},
				&Setup{},
				&TopUp{},
				&SubscriptionPlan{},
				&SubscriptionOrder{},
				&UserSubscription{},
				&SubscriptionPreConsumeRecord{},
				&Log{},
			}
			// Run AutoMigrate twice to verify migration idempotency across all three engines.
			require.NoError(t, db.AutoMigrate(modelsToMigrate...))
			require.NoError(t, db.AutoMigrate(modelsToMigrate...))

			prevDB, prevLogDB := DB, LOG_DB
			prevMainType, prevLogType := common.MainDatabaseType(), common.LogDatabaseType()
			oldQuotaPerUnit := common.QuotaPerUnit
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(dialect.name, dialect.name)
			common.QuotaPerUnit = 500000
			initCol()

			t.Cleanup(func() {
				DB, LOG_DB = prevDB, prevLogDB
				common.SetDatabaseTypes(prevMainType, prevLogType)
				common.QuotaPerUnit = oldQuotaPerUnit
				initCol()
				if dialect.name != common.DatabaseTypeSQLite {
					_ = db.Migrator().DropTable(modelsToMigrate...)
				}
				_ = sqlDB.Close()
			})

			// 1. Atomic CompleteInitialSetup under concurrency
			const workers = 6
			var wg sync.WaitGroup
			wins := make(chan bool, workers)
			for i := range workers {
				wg.Go(func() {
					u := &User{
						Username:    fmt.Sprintf("root%d", i),
						Password:    "hashed",
						Role:        common.RoleRootUser,
						Status:      common.UserStatusEnabled,
						DisplayName: "Root",
					}
					_, sErr := CompleteInitialSetup(u, true, false)
					wins <- (sErr == nil)
				})
			}
			wg.Wait()
			close(wins)
			winTotal := 0
			for w := range wins {
				if w {
					winTotal++
				}
			}
			assert.Equal(t, 1, winTotal)

			var rootUsers int64
			require.NoError(t, db.Model(&User{}).Where("role = ?", common.RoleRootUser).Count(&rootUsers).Error)
			assert.Equal(t, int64(1), rootUsers)

			// 2. Payment amount guards + Creem does not overwrite empty email
			buyer := &User{
				Username: "buyer_matrix",
				Password: "hashed",
				Role:     common.RoleCommonUser,
				Status:   common.UserStatusEnabled,
				AffCode:  "BUYERMAT",
			}
			require.NoError(t, db.Create(buyer).Error)

			epayTopUp := &TopUp{
				UserId:          buyer.Id,
				Amount:          2,
				Money:           10.00,
				TradeNo:         "MAT_EPAY_1",
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				Status:          common.TopUpStatusPending,
				CreateTime:      time.Now().Unix(),
			}
			require.NoError(t, epayTopUp.Insert())
			_, err = RechargeEpayWithAmount("MAT_EPAY_1", "alipay", decimal.NewFromFloat(0.01), "127.0.0.1")
			require.ErrorIs(t, err, ErrPaymentAmountMismatch)
			alreadyDone, err := RechargeEpayWithAmount("MAT_EPAY_1", "alipay", decimal.NewFromFloat(10.00), "127.0.0.1")
			require.NoError(t, err)
			assert.False(t, alreadyDone)

			creemTopUp := &TopUp{
				UserId:          buyer.Id,
				Amount:          250000,
				Money:           5.00,
				TradeNo:         "MAT_CREEM_1",
				PaymentMethod:   PaymentMethodCreem,
				PaymentProvider: PaymentProviderCreem,
				Status:          common.TopUpStatusPending,
				CreateTime:      time.Now().Unix(),
			}
			require.NoError(t, creemTopUp.Insert())
			require.NoError(t, RechargeCreem("MAT_CREEM_1", "unverified@attacker.test", "Attacker", "127.0.0.1"))

			var refreshedBuyer User
			require.NoError(t, db.Where("id = ?", buyer.Id).First(&refreshedBuyer).Error)
			assert.Empty(t, refreshedBuyer.Email)
			assert.Equal(t, 1_250_000, refreshedBuyer.Quota)

			// 3. Subscription pre-consume + refund (single-connection safe on SQLite, row-locked on MySQL/PostgreSQL)
			plan := &SubscriptionPlan{
				Title:         "Matrix Plan",
				PriceAmount:   19.99,
				Currency:      "USD",
				DurationUnit:  SubscriptionDurationMonth,
				DurationValue: 1,
				Enabled:       true,
				TotalAmount:   5000,
			}
			require.NoError(t, db.Create(plan).Error)
			now := GetDBTimestamp()
			sub := &UserSubscription{
				UserId:      buyer.Id,
				PlanId:      plan.Id,
				AmountTotal: 5000,
				AmountUsed:  0,
				StartTime:   now - 60,
				EndTime:     now + 86400,
				Status:      "active",
				Source:      "order",
				CreatedAt:   now,
				UpdatedAt:   now,
			}
			require.NoError(t, db.Create(sub).Error)

			preRes, err := PreConsumeUserSubscription("mat-sub-req-1", buyer.Id, "gpt-4o", 0, 400)
			require.NoError(t, err)
			assert.Equal(t, int64(400), preRes.AmountUsedAfter)
			require.NoError(t, RefundSubscriptionPreConsume("mat-sub-req-1"))
			require.NoError(t, RefundSubscriptionPreConsume("mat-sub-req-1"))

			var refreshedSub UserSubscription
			require.NoError(t, db.Where("id = ?", sub.Id).First(&refreshedSub).Error)
			assert.Zero(t, refreshedSub.AmountUsed)

			// 4. Re-run AutoMigrate on populated tables to verify upgrade idempotency and constraint preservation
			require.NoError(t, db.AutoMigrate(modelsToMigrate...))
			require.Error(t, db.Create(&Setup{ID: 1, Version: "dup", InitializedAt: now}).Error)
			require.Error(t, db.Create(&User{Username: "dup_aff", Password: "h", AffCode: "BUYERMAT"}).Error)
			require.NoError(t, db.Where("id = ?", buyer.Id).First(&refreshedBuyer).Error)
			assert.Equal(t, 1_250_000, refreshedBuyer.Quota)
		})
	}
}
