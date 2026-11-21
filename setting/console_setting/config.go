package console_setting

import "github.com/QuantumNous/new-api/setting/config"

type ConsoleSetting struct {
	ApiInfo                     string `json:"api_info"`                       // 控制台 API 信息 (JSON 数组字符串)
	UptimeKumaGroups            string `json:"uptime_kuma_groups"`             // 兼容历史 Uptime Kuma 配置
	ChannelProbeEnabled         bool   `json:"channel_probe_enabled"`          // 是否启用内置渠道模型定时探测
	ChannelProbeIntervalMinutes int    `json:"channel_probe_interval_minutes"` // 定时探测间隔（分钟）
	ChannelProbeTargets         string `json:"channel_probe_targets"`          // 内置渠道模型探测目标配置 (JSON 数组字符串)
	ChannelProbeOptions         string `json:"channel_probe_options"`          // 内置渠道探测队列与自定义请求选项 (JSON 对象字符串)
	ChannelProbeHistory         string `json:"channel_probe_history"`          // 内置渠道模型探测历史快照 (JSON 对象字符串)
	Announcements               string `json:"announcements"`                  // 系统公告 (JSON 数组字符串)
	FAQ                         string `json:"faq"`                            // 常见问题 (JSON 数组字符串)
	ApiInfoEnabled              bool   `json:"api_info_enabled"`               // 是否启用 API 信息面板
	UptimeKumaEnabled           bool   `json:"uptime_kuma_enabled"`            // 是否启用渠道成功率状态面板
	AnnouncementsEnabled        bool   `json:"announcements_enabled"`          // 是否启用系统公告面板
	FAQEnabled                  bool   `json:"faq_enabled"`                    // 是否启用常见问答面板
}

// 默认配置
var defaultConsoleSetting = ConsoleSetting{
	ApiInfo:                     "",
	UptimeKumaGroups:            "",
	ChannelProbeEnabled:         false,
	ChannelProbeIntervalMinutes: 15,
	ChannelProbeTargets:         "",
	ChannelProbeOptions:         "",
	ChannelProbeHistory:         "",
	Announcements:               "",
	FAQ:                         "",
	ApiInfoEnabled:              true,
	UptimeKumaEnabled:           true,
	AnnouncementsEnabled:        true,
	FAQEnabled:                  true,
}

// 全局实例
var consoleSetting = defaultConsoleSetting

func init() {
	// 注册到全局配置管理器，键名为 console_setting
	config.GlobalConfig.Register("console_setting", &consoleSetting)
}

// GetConsoleSetting 获取 ConsoleSetting 配置实例
func GetConsoleSetting() *ConsoleSetting {
	return &consoleSetting
}
