package controller

import (
	"errors"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

var setupMu sync.Mutex

type Setup struct {
	Status       bool   `json:"status"`
	RootInit     bool   `json:"root_init"`
	DatabaseType string `json:"database_type"`
}

type SetupRequest struct {
	Username           string `json:"username"`
	Password           string `json:"password"`
	ConfirmPassword    string `json:"confirmPassword"`
	SelfUseModeEnabled bool   `json:"SelfUseModeEnabled"`
	DemoSiteEnabled    bool   `json:"DemoSiteEnabled"`
}

func GetSetup(c *gin.Context) {
	if !constant.Setup && model.DB != nil && model.GetSetup() != nil {
		constant.Setup = true
	}
	setup := Setup{
		Status: constant.Setup,
	}
	if constant.Setup {
		c.JSON(200, gin.H{
			"success": true,
			"data":    setup,
		})
		return
	}
	setup.RootInit = model.RootUserExists()
	setup.DatabaseType = string(common.MainDatabaseType())
	c.JSON(200, gin.H{
		"success": true,
		"data":    setup,
	})
}

func PostSetup(c *gin.Context) {
	setupMu.Lock()
	defer setupMu.Unlock()

	if constant.Setup || (model.DB != nil && model.GetSetup() != nil) {
		constant.Setup = true
		common.ApiErrorT(c, "The system is already initialized")
		return
	}

	var req SetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}

	rootExists := model.RootUserExists()
	var rootUser *model.User
	username := strings.TrimSpace(req.Username)
	if !rootExists {
		if username == "" || username != req.Username || strings.ContainsAny(username, " \t\r\n") {
			common.ApiErrorT(c, "Invalid parameters")
			return
		}
		if len(username) > 12 {
			common.ApiErrorT(c, "Username must be {{max}} characters or fewer", map[string]any{"max": 12})
			return
		}
		if req.Password != req.ConfirmPassword {
			common.ApiErrorT(c, "Passwords do not match")
			return
		}
		if err := common.ValidateNewAccountPassword(req.Password); err != nil {
			c.JSON(200, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		hashedPassword, err := common.HashAccountPassword(req.Password)
		if err != nil {
			logger.LogError(c.Request.Context(), common.LogText("setup password hash failed client_ip=%s error=%q", c.ClientIP(), err.Error()))
			common.ApiErrorT(c, "Failed to initialize the system")
			return
		}
		rootUser = &model.User{
			Username:    username,
			Password:    hashedPassword,
			Role:        common.RoleRootUser,
			Status:      common.UserStatusEnabled,
			DisplayName: "Root User",
			AccessToken: nil,
			Quota:       100000000,
		}
	}

	createdRoot, err := model.CompleteInitialSetup(rootUser, req.SelfUseModeEnabled, req.DemoSiteEnabled)
	if err != nil {
		if errors.Is(err, model.ErrSystemAlreadyInitialized) {
			constant.Setup = true
			logger.LogWarn(c.Request.Context(), common.LogText("setup rejected reason=already_initialized client_ip=%s", c.ClientIP()))
			common.ApiErrorT(c, "The system is already initialized")
			return
		}
		logger.LogError(c.Request.Context(), common.LogText("setup transaction failed username=%q client_ip=%s error=%q", username, c.ClientIP(), err.Error()))
		common.ApiErrorT(c, "Failed to initialize the system")
		return
	}

	logger.LogInfo(c.Request.Context(), common.LogText("system setup completed root_created=%t username=%q self_use=%t demo_site=%t client_ip=%s", createdRoot, username, req.SelfUseModeEnabled, req.DemoSiteEnabled, c.ClientIP()))
	common.ApiSuccessT(c, "System initialized successfully", nil)
}
