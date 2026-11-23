package model

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

var (
	ErrSystemAlreadyInitialized = errors.New("system already initialized")
	ErrSetupAdminRequired       = errors.New("administrator account required")
)

type Setup struct {
	ID            uint   `json:"id" gorm:"primaryKey"`
	Version       string `json:"version" gorm:"type:varchar(50);not null"`
	InitializedAt int64  `json:"initialized_at" gorm:"type:bigint;not null"`
}

func GetSetup() *Setup {
	var setup Setup
	err := DB.First(&setup).Error
	if err != nil {
		return nil
	}
	return &setup
}

func saveSetupOptionTx(tx *gorm.DB, key, value string) error {
	option := Option{Key: key}
	if err := tx.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
		return err
	}
	option.Value = value
	return tx.Save(&option).Error
}

// CompleteInitialSetup atomically initializes the system once across single- or
// multi-node deployments by claiming Setup{ID: 1} inside a single DB transaction
// before creating the root user (if none exists) and persisting mode options.
func CompleteInitialSetup(rootUser *User, selfUseModeEnabled, demoSiteEnabled bool) (bool, error) {
	selfUseStr := strconv.FormatBool(selfUseModeEnabled)
	demoStr := strconv.FormatBool(demoSiteEnabled)
	createdRoot := false

	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing Setup
		if err := lockForUpdate(tx).First(&existing).Error; err == nil {
			return ErrSystemAlreadyInitialized
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		setup := Setup{
			ID:            1,
			Version:       common.Version,
			InitializedAt: time.Now().Unix(),
		}
		if err := tx.Create(&setup).Error; err != nil {
			return ErrSystemAlreadyInitialized
		}

		var rootCount int64
		if err := tx.Model(&User{}).Where("role = ?", common.RoleRootUser).Count(&rootCount).Error; err != nil {
			return err
		}
		if rootCount == 0 {
			if rootUser == nil {
				return ErrSetupAdminRequired
			}
			if strings.TrimSpace(rootUser.AffCode) == "" {
				rootUser.AffCode = common.GetRandomString(8)
			}
			if err := tx.Create(rootUser).Error; err != nil {
				return err
			}
			createdRoot = true
		}

		if err := saveSetupOptionTx(tx, "SelfUseModeEnabled", selfUseStr); err != nil {
			return err
		}
		return saveSetupOptionTx(tx, "DemoSiteEnabled", demoStr)
	})
	if err != nil {
		return false, err
	}

	common.OptionMapRWMutex.Lock()
	if common.OptionMap != nil {
		common.OptionMap["SelfUseModeEnabled"] = selfUseStr
		common.OptionMap["DemoSiteEnabled"] = demoStr
	}
	common.OptionMapRWMutex.Unlock()
	operation_setting.SelfUseModeEnabled = selfUseModeEnabled
	operation_setting.DemoSiteEnabled = demoSiteEnabled
	constant.Setup = true
	return createdRoot, nil
}
