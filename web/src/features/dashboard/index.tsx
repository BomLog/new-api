/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  Calendar,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { FadeIn } from '@/components/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuota } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ModelsChartPreferences } from './components/models/models-chart-preferences'
import { ModelsFilter } from './components/models/models-filter-dialog'
import { OverviewDashboard } from './components/overview/overview-dashboard'
import {
  DEFAULT_TIME_GRANULARITY,
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from './constants'
import {
  buildDefaultDashboardFilters,
  getDefaultDays,
  getSavedChartPreferences,
  getSavedGranularity,
  saveChartPreferences,
} from './lib'
import {
  type DashboardSectionId,
  DASHBOARD_DEFAULT_SECTION,
  DASHBOARD_SECTION_IDS,
} from './section-registry'
import type {
  DashboardChartPreferences,
  DashboardFilters,
  QuotaDataItem,
  UserChartsFilters,
} from './types'

const route = getRouteApi('/_authenticated/dashboard/$section')

const KPI_CARD_FALLBACK_KEYS = [
  'quota',
  'count',
  'tokens',
  'cache',
  'blended',
] as const

const LazyLogStatCards = lazy(() =>
  import('./components/models/log-stat-cards').then((m) => ({
    default: m.LogStatCards,
  }))
)

const LazyModelCharts = lazy(() =>
  import('./components/models/model-charts').then((m) => ({
    default: m.ModelCharts,
  }))
)

const LazyModelBreakdownPanel = lazy(() =>
  import('./components/models/model-breakdown-panel').then((m) => ({
    default: m.ModelBreakdownPanel,
  }))
)

const LazyChannelRankingPanel = lazy(() =>
  import('./components/models/channel-ranking-panel').then((m) => ({
    default: m.ChannelRankingPanel,
  }))
)

const LazyConsumptionDistributionChart = lazy(() =>
  import('./components/models/consumption-distribution-chart').then((m) => ({
    default: m.ConsumptionDistributionChart,
  }))
)

const LazyPerformanceOverview = lazy(() =>
  import('./components/models/performance-overview').then((m) => ({
    default: m.PerformanceOverview,
  }))
)

const LazyUserCharts = lazy(() =>
  import('./components/users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

const LazyFlowCharts = lazy(() =>
  import('./components/flow/flow-charts').then((m) => ({
    default: m.FlowCharts,
  }))
)

function LogStatCardsFallback() {
  return (
    <div className='space-y-3'>
      <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {KPI_CARD_FALLBACK_KEYS.map((key) => (
          <div key={key} className='bg-card rounded-xl border p-3.5'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-3.5 w-20' />
              <Skeleton className='h-4 w-12 rounded-md' />
            </div>
            <div className='mt-3 flex items-end justify-between'>
              <Skeleton className='h-7 w-20' />
              <Skeleton className='h-7 w-20' />
            </div>
            <div className='mt-3 border-t pt-2'>
              <Skeleton className='h-3 w-full' />
            </div>
          </div>
        ))}
      </div>
      <div className='bg-card rounded-xl border px-4 py-3'>
        <Skeleton className='h-5 w-full' />
      </div>
    </div>
  )
}

function ModelChartsFallback() {
  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex items-center justify-between border-b px-4 py-3 sm:px-5'>
        <Skeleton className='h-5 w-36' />
        <Skeleton className='h-8 w-56' />
      </div>
      <div className='h-80 p-3'>
        <Skeleton className='h-full w-full rounded-lg' />
      </div>
    </div>
  )
}

function PerformanceOverviewFallback() {
  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5'>
        <Skeleton className='h-5 w-44' />
        <div className='flex items-center gap-2'>
          <Skeleton className='h-8 w-28 rounded-lg' />
          <Skeleton className='h-8 w-28 rounded-lg' />
          <Skeleton className='h-8 w-28 rounded-lg' />
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6 sm:px-5'>
        {['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((key) => (
          <Skeleton key={key} className='h-12 rounded-lg' />
        ))}
      </div>
    </div>
  )
}

function granularityForRangeDays(days: number): TimeGranularity {
  if (days <= 1) return 'hour'
  if (days >= 29) return 'week'
  return 'day'
}

function detectQuickRangeDays(filters: DashboardFilters): number | null {
  const start = filters.start_timestamp
  const end = filters.end_timestamp
  if (!start || !end) return null
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return TIME_RANGE_PRESETS.some((preset) => preset.days === days) ? days : null
}

function escapeCsvCell(value: string | number): string {
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`
  }
  return str
}

function exportModelSummaryCsv(data: QuotaDataItem[]): boolean {
  if (data.length === 0) return false
  const byModel = new Map<
    string,
    {
      count: number
      quota: number
      tokens: number
      cacheRead: number
      cacheWrite: number
    }
  >()

  for (const item of data) {
    const model = item.model_name || 'Unknown'
    const prev = byModel.get(model) ?? {
      count: 0,
      quota: 0,
      tokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }
    byModel.set(model, {
      count: prev.count + (Number(item.count) || 0),
      quota: prev.quota + (Number(item.quota) || 0),
      tokens: prev.tokens + (Number(item.token_used) || 0),
      cacheRead: prev.cacheRead + Math.max(0, Number(item.cache_read_tokens) || 0),
      cacheWrite:
        prev.cacheWrite + Math.max(0, Number(item.cache_creation_tokens) || 0),
    })
  }

  const rows = [...byModel.entries()].sort((a, b) => b[1].quota - a[1].quota)
  const header = [
    'Model',
    'Requests',
    'Quota (Formatted)',
    'Quota (Raw)',
    'Tokens',
    'Cache Read Tokens',
    'Cache Write Tokens',
    'Cache Hit Rate (%)',
    'Cost / 1M Tokens',
  ]
  const lines = [
    header.map(escapeCsvCell).join(','),
    ...rows.map(([model, s]) => {
      const denom = s.tokens + s.cacheRead
      const hitPct = denom > 0 ? ((s.cacheRead / denom) * 100).toFixed(2) : '0.00'
      const costPerM = s.tokens > 0 ? (s.quota * 1_000_000) / s.tokens : 0
      return [
        model,
        s.count,
        formatQuota(s.quota),
        s.quota,
        s.tokens,
        s.cacheRead,
        s.cacheWrite,
        hitPct,
        formatQuota(costPerM),
      ]
        .map(escapeCsvCell)
        .join(',')
    }),
  ]

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `dashboard-analytics-${stamp}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return true
}

const SECTION_META: Record<DashboardSectionId, { titleKey: string }> = {
  overview: {
    titleKey: 'Overview',
  },
  models: {
    titleKey: 'Model Call Analytics',
  },
  flow: {
    titleKey: 'Flow',
  },
  users: {
    titleKey: 'User Analytics',
  },
}

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = route.useParams()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const activeSection = (params.section ??
    DASHBOARD_DEFAULT_SECTION) as DashboardSectionId

  const [modelData, setModelData] = useState<QuotaDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [chartPreferences, setChartPreferences] =
    useState<DashboardChartPreferences>(() => getSavedChartPreferences())
  const [modelFilters, setModelFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [userChartsFilters, setUserChartsFilters] = useState<UserChartsFilters>(
    () => {
      const granularity = getSavedGranularity()
      return {
        timeGranularity: granularity,
        selectedRange: getDefaultDays(granularity),
        topUserLimit: 10,
      }
    }
  )
  const [flowSensitiveVisible, setFlowSensitiveVisible] = useState(true)

  const handleFilterChange = useCallback((filters: DashboardFilters) => {
    setModelFilters(filters)
  }, [])

  const handleResetFilters = useCallback(() => {
    setSelectedModel(null)
    setModelFilters(buildDefaultDashboardFilters(chartPreferences))
  }, [chartPreferences])

  const handleQuickRangeSelect = useCallback((days: number) => {
    const { start, end } = getRollingDateRange(days)
    setModelFilters((prev) => ({
      ...prev,
      start_timestamp: start,
      end_timestamp: end,
      time_granularity: granularityForRangeDays(days),
    }))
  }, [])

  const handleGranularitySelect = useCallback((granularity: TimeGranularity) => {
    setModelFilters((prev) => ({
      ...prev,
      time_granularity: granularity,
    }))
  }, [])

  const handleDataUpdate = useCallback(
    (data: QuotaDataItem[], loading: boolean) => {
      setModelData(data)
      setDataLoading(loading)
    },
    []
  )

  const handleChartPreferencesChange = useCallback(
    (preferences: DashboardChartPreferences) => {
      setChartPreferences(preferences)
      setModelFilters(buildDefaultDashboardFilters(preferences))
      saveChartPreferences(preferences)
    },
    []
  )

  const filteredModelData = useMemo(() => {
    if (!selectedModel) return modelData
    return modelData.filter((item) => item.model_name === selectedModel)
  }, [modelData, selectedModel])

  const handleExportCsv = useCallback(() => {
    const ok = exportModelSummaryCsv(filteredModelData)
    if (ok) {
      toast.success(t('CSV report exported'))
    } else {
      toast.error(t('No data available to export'))
    }
  }, [filteredModelData, t])

  const activeRangeDays = useMemo(
    () => detectQuickRangeDays(modelFilters),
    [modelFilters]
  )
  const activeGranularity =
    modelFilters.time_granularity || DEFAULT_TIME_GRANULARITY

  const meta = SECTION_META[activeSection] ?? SECTION_META.overview
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const visibleSections = useMemo(
    () =>
      DASHBOARD_SECTION_IDS.filter(
        (section) => section !== 'overview' && (section !== 'users' || isAdmin)
      ),
    [isAdmin]
  )
  const handleSectionChange = useCallback(
    (section: string) => {
      void navigate({
        to: '/dashboard/$section',
        params: { section: section as DashboardSectionId },
      })
    },
    [navigate]
  )
  const showSectionTabs =
    activeSection !== 'overview' && visibleSections.length > 1

  const quickRangeControls =
    activeSection === 'models' || activeSection === 'flow' ? (
      <div className='flex flex-wrap items-center gap-2'>
        <div className='bg-muted/60 inline-flex h-8 items-center rounded-lg border p-0.5'>
          <Calendar
            className='text-muted-foreground mr-1 ml-2 size-3.5 shrink-0'
            aria-hidden='true'
          />
          {TIME_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.days}
              type='button'
              onClick={() => handleQuickRangeSelect(preset.days)}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                activeRangeDays === preset.days
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(preset.label)}
            </button>
          ))}
        </div>

        {activeSection === 'models' ? (
          <div className='bg-muted/60 hidden h-8 items-center rounded-lg border p-0.5 sm:inline-flex'>
            {TIME_GRANULARITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type='button'
                onClick={() => handleGranularitySelect(option.value)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                  activeGranularity === option.value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : null

  const modelActions =
    activeSection === 'models' ? (
      <>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={handleExportCsv}
          disabled={dataLoading || filteredModelData.length === 0}
        >
          <Download className='mr-1.5 size-3.5' aria-hidden='true' />
          {t('Export CSV')}
        </Button>
        <ModelsChartPreferences
          preferences={chartPreferences}
          onPreferencesChange={handleChartPreferencesChange}
        />
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />
      </>
    ) : null

  const flowActions =
    activeSection === 'flow' ? (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setFlowSensitiveVisible((prev) => !prev)}
                aria-label={
                  flowSensitiveVisible
                    ? t('Hide sensitive data')
                    : t('Show sensitive data')
                }
                className='text-muted-foreground hover:text-foreground size-8'
              />
            }
          >
            {flowSensitiveVisible ? <Eye /> : <EyeOff />}
          </TooltipTrigger>
          <TooltipContent>
            {flowSensitiveVisible
              ? t('Hide sensitive data')
              : t('Show sensitive data')}
          </TooltipContent>
        </Tooltip>
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          titleKey='Flow Filters'
          descriptionKey='Filter the traffic flow view by time range and user.'
        />
      </>
    ) : null

  const sectionActions = modelActions ?? flowActions
  const hasActiveFilterChips = Boolean(
    activeSection === 'models' && (selectedModel || modelFilters.username)
  )

  if (activeSection === 'overview') {
    return <OverviewDashboard />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t(meta.titleKey)}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          {/* Unified Analytics Command Bar */}
          <div className='bg-card flex flex-wrap items-center justify-between gap-2.5 rounded-xl border p-2.5 sm:px-3.5'>
            <div className='flex flex-wrap items-center gap-2'>
              {showSectionTabs ? (
                <Tabs value={activeSection} onValueChange={handleSectionChange}>
                  <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
                    {visibleSections.map((section) => (
                      <TabsTrigger key={section} value={section}>
                        {t(SECTION_META[section].titleKey)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              ) : null}
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              {quickRangeControls}
              {sectionActions != null ? (
                <div className='flex shrink-0 flex-wrap items-center gap-1.5'>
                  {sectionActions}
                </div>
              ) : null}
            </div>
          </div>

          {/* Active Interactive Filter Chips */}
          {hasActiveFilterChips ? (
            <div className='flex flex-wrap items-center gap-2'>
              {selectedModel ? (
                <Badge
                  variant='secondary'
                  className='border-primary/30 bg-primary/10 text-primary gap-1.5 py-1 pr-1.5 pl-2.5 font-mono text-xs'
                >
                  <Sparkles className='size-3' />
                  <span>{selectedModel}</span>
                  <button
                    type='button'
                    onClick={() => setSelectedModel(null)}
                    aria-label={t('Clear')}
                    className='hover:bg-primary/20 rounded-full p-0.5 transition-colors'
                  >
                    <X className='size-3' />
                  </button>
                </Badge>
              ) : null}
              {modelFilters.username ? (
                <Badge
                  variant='secondary'
                  className='gap-1.5 py-1 pr-1.5 pl-2.5 text-xs'
                >
                  <User className='size-3' />
                  <span>{modelFilters.username}</span>
                  <button
                    type='button'
                    onClick={() =>
                      setModelFilters((prev) => ({ ...prev, username: '' }))
                    }
                    aria-label={t('Clear')}
                    className='hover:bg-muted rounded-full p-0.5 transition-colors'
                  >
                    <X className='size-3' />
                  </button>
                </Badge>
              ) : null}
            </div>
          ) : null}

          {activeSection === 'models' && (
            <>
              <FadeIn>
                <Suspense fallback={<LogStatCardsFallback />}>
                  <LazyLogStatCards
                    filters={modelFilters}
                    selectedModel={selectedModel}
                    onDataUpdate={handleDataUpdate}
                  />
                </Suspense>
              </FadeIn>

              {isAdmin && (
                <FadeIn delay={0.04}>
                  <Suspense fallback={<PerformanceOverviewFallback />}>
                    <LazyPerformanceOverview
                      selectedModel={selectedModel}
                      onSelectModel={setSelectedModel}
                    />
                  </Suspense>
                </FadeIn>
              )}

              <FadeIn delay={0.08}>
                <Suspense fallback={<ModelChartsFallback />}>
                  <LazyConsumptionDistributionChart
                    data={filteredModelData}
                    loading={dataLoading}
                    defaultChartType={
                      chartPreferences.consumptionDistributionChart
                    }
                    timeGranularity={activeGranularity}
                  />
                </Suspense>
              </FadeIn>

              <FadeIn delay={0.12}>
                <div className='grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12'>
                  <div className='min-w-0 xl:col-span-7'>
                    <Suspense fallback={<ModelChartsFallback />}>
                      <LazyModelCharts
                        data={filteredModelData}
                        loading={dataLoading}
                        defaultChartTab={chartPreferences.modelAnalyticsChart}
                        timeGranularity={activeGranularity}
                      />
                    </Suspense>
                  </div>
                  <div className='min-w-0 xl:col-span-5'>
                    <Suspense fallback={<ModelChartsFallback />}>
                      <LazyModelBreakdownPanel
                        data={modelData}
                        loading={dataLoading}
                        selectedModel={selectedModel}
                        onSelectModel={setSelectedModel}
                      />
                    </Suspense>
                  </div>
                </div>
              </FadeIn>

              {isAdmin && (
                <FadeIn delay={0.16}>
                  <Suspense fallback={<PerformanceOverviewFallback />}>
                    <LazyChannelRankingPanel
                      filters={modelFilters}
                      selectedModel={selectedModel}
                    />
                  </Suspense>
                </FadeIn>
              )}
            </>
          )}

          {activeSection === 'users' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyUserCharts
                  filters={userChartsFilters}
                  onFiltersChange={setUserChartsFilters}
                />
              </Suspense>
            </FadeIn>
          )}

          {activeSection === 'flow' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyFlowCharts
                  filters={modelFilters}
                  sensitiveVisible={flowSensitiveVisible}
                />
              </Suspense>
            </FadeIn>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
