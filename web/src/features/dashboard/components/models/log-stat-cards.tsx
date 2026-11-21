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
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  DatabaseZap,
  Hash,
  Layers,
  Minus,
  Scale,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { getUserQuotaDates } from '@/features/dashboard/api'
import {
  buildQueryParams,
  calculateDashboardStats,
  getDefaultDays,
  safeDivide,
} from '@/features/dashboard/lib'
import type {
  DashboardFilters,
  QuotaDataItem,
} from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { computeTimeRange } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface LogStatCardsProps {
  filters?: DashboardFilters
  selectedModel?: string | null
  onDataUpdate?: (data: QuotaDataItem[], loading: boolean) => void
}

const MAX_INLINE_STAT_CHARS = 8

function formatStatNumber(value: number, locale: Intl.LocalesArgument) {
  const fullValue = formatNumber(value, locale)
  const displayValue =
    fullValue.length > MAX_INLINE_STAT_CHARS
      ? formatCompactNumber(value, locale)
      : fullValue

  return {
    displayValue,
    fullValue,
  }
}

function getCacheHitTextClass(ratio: number): string {
  if (ratio >= 0.7) return 'text-emerald-600 dark:text-emerald-400'
  if (ratio >= 0.4) return 'text-sky-600 dark:text-sky-400'
  if (ratio >= 0.15) return 'text-amber-600 dark:text-amber-400'
  if (ratio > 0) return 'text-orange-600 dark:text-orange-400'
  return 'text-foreground'
}

interface DeltaInfo {
  label: string
  direction: 'up' | 'down' | 'flat'
  tone: 'positive' | 'negative' | 'neutral'
}

function computePercentDelta(
  current: number,
  previous: number,
  invertGood = false
): DeltaInfo | null {
  if (previous <= 0 && current <= 0) return null
  if (previous <= 0) {
    return {
      label: '+100%',
      direction: 'up',
      tone: invertGood ? 'negative' : 'positive',
    }
  }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.1) {
    return { label: '0.0%', direction: 'flat', tone: 'neutral' }
  }
  const direction = pct > 0 ? 'up' : 'down'
  const isGood = invertGood ? pct < 0 : pct > 0
  return {
    label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
    direction,
    tone: isGood ? 'positive' : 'negative',
  }
}

function computePointDelta(
  currentRatio: number,
  previousRatio: number,
  hasPrev: boolean
): DeltaInfo | null {
  if (!hasPrev) return null
  const diffPp = (currentRatio - previousRatio) * 100
  if (Math.abs(diffPp) < 0.1) {
    return { label: '0.0pp', direction: 'flat', tone: 'neutral' }
  }
  return {
    label: `${diffPp > 0 ? '+' : ''}${diffPp.toFixed(1)}pp`,
    direction: diffPp > 0 ? 'up' : 'down',
    tone: diffPp > 0 ? 'positive' : 'negative',
  }
}

function DeltaPill(props: { delta: DeltaInfo | null; title: string }) {
  if (!props.delta) return null
  let colorClass = 'bg-muted text-muted-foreground'
  if (props.delta.tone === 'positive') {
    colorClass =
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  } else if (props.delta.tone === 'negative') {
    colorClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }

  let Icon = Minus
  if (props.delta.direction === 'up') Icon = ArrowUpRight
  if (props.delta.direction === 'down') Icon = ArrowDownRight

  return (
    <span
      title={props.title}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums',
        colorClass
      )}
    >
      <Icon className='size-3 shrink-0' aria-hidden='true' />
      <span>{props.delta.label}</span>
    </span>
  )
}

function MiniSparkline(props: {
  points: number[]
  strokeClass: string
  fillColor: string
}) {
  const gradientId = useId()
  const { linePath, areaPath } = useMemo(() => {
    const values = props.points
    if (values.length < 2) return { linePath: '', areaPath: '' }
    const width = 88
    const height = 28
    const padY = 3
    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values, 0)
    const range = Math.max(maxVal - minVal, 1)
    const stepX = width / (values.length - 1)

    const coords = values.map((v, i) => {
      const x = Number((i * stepX).toFixed(1))
      const y = Number(
        (height - padY - ((v - minVal) / range) * (height - padY * 2)).toFixed(
          1
        )
      )
      return { x, y }
    })

    const line = coords
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x},${pt.y}`)
      .join(' ')
    const area = `${line} L${width},${height} L0,${height} Z`
    return { linePath: line, areaPath: area }
  }, [props.points])

  if (!linePath) {
    return <div className='h-[28px] w-[88px] shrink-0' aria-hidden='true' />
  }

  return (
    <svg
      viewBox='0 0 88 28'
      className='h-[28px] w-[88px] shrink-0 overflow-visible'
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor={props.fillColor} stopOpacity='0.18' />
          <stop offset='100%' stopColor={props.fillColor} stopOpacity='0.0' />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill='none'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        className={props.strokeClass}
      />
    </svg>
  )
}

interface KpiCardDescriptor {
  key: string
  title: string
  value: string
  fullValue: string
  valueClassName?: string
  icon: LucideIcon
  delta: DeltaInfo | null
  sparklineStrokeClass: string
  sparklineFillColor: string
  sparklinePoints: number[]
  metaLeft: string
  metaRight: string
}

export function LogStatCards(props: LogStatCardsProps) {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = !!(user?.role && user.role >= 10)
  const [rawData, setRawData] = useState<QuotaDataItem[]>([])
  const [prevRawData, setPrevRawData] = useState<QuotaDataItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [timeRangeMinutes, setTimeRangeMinutes] = useState(1)

  const { filters, onDataUpdate } = props

  useEffect(() => {
    const abortController = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(false)
    onDataUpdate?.([], true)

    const timeRange = computeTimeRange(
      getDefaultDays(filters?.time_granularity),
      filters?.start_timestamp,
      filters?.end_timestamp
    )
    const spanSeconds = Math.max(
      3600,
      timeRange.end_timestamp - timeRange.start_timestamp
    )
    setTimeRangeMinutes(spanSeconds / 60)

    const prevRange = {
      start_timestamp: Math.max(0, timeRange.start_timestamp - spanSeconds),
      end_timestamp: timeRange.start_timestamp,
    }

    const currentReq = getUserQuotaDates(
      buildQueryParams(timeRange, filters),
      isAdmin
    )
    const prevReq = getUserQuotaDates(
      buildQueryParams(prevRange, filters),
      isAdmin
    ).catch(() => ({ success: false, data: [] as QuotaDataItem[] }))

    void Promise.all([currentReq, prevReq])
      .then(([currentRes, prevRes]) => {
        if (abortController.signal.aborted) return
        const data = currentRes?.data || []
        setRawData(data)
        setPrevRawData(prevRes?.data || [])
        onDataUpdate?.(data, false)
      })
      .catch(() => {
        if (abortController.signal.aborted) return
        setRawData([])
        setPrevRawData([])
        setError(true)
        onDataUpdate?.([], false)
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [filters, isAdmin, onDataUpdate])

  const activeData = useMemo(() => {
    if (!props.selectedModel) return rawData
    return rawData.filter((item) => item.model_name === props.selectedModel)
  }, [rawData, props.selectedModel])

  const activePrevData = useMemo(() => {
    if (!props.selectedModel) return prevRawData
    return prevRawData.filter((item) => item.model_name === props.selectedModel)
  }, [prevRawData, props.selectedModel])

  const stats = useMemo(
    () => calculateDashboardStats(activeData),
    [activeData]
  )
  const prevStats = useMemo(
    () => calculateDashboardStats(activePrevData),
    [activePrevData]
  )

  const seriesBuckets = useMemo(() => {
    const bucketMap = new Map<
      number,
      { quota: number; count: number; tokens: number; cacheRead: number }
    >()
    const modelsSet = new Set<string>()

    for (const item of activeData) {
      const ts = Number(item.created_at) || 0
      if (item.model_name) modelsSet.add(item.model_name)
      const prev = bucketMap.get(ts) ?? {
        quota: 0,
        count: 0,
        tokens: 0,
        cacheRead: 0,
      }
      bucketMap.set(ts, {
        quota: prev.quota + (Number(item.quota) || 0),
        count: prev.count + (Number(item.count) || 0),
        tokens: prev.tokens + (Number(item.token_used) || 0),
        cacheRead:
          prev.cacheRead + Math.max(0, Number(item.cache_read_tokens) || 0),
      })
    }

    const ordered = [...bucketMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val)

    const maxSamples = 20
    const sampled =
      ordered.length <= maxSamples
        ? ordered
        : Array.from({ length: maxSamples }, (_, idx) => {
            const start = Math.floor((idx * ordered.length) / maxSamples)
            const end = Math.max(
              start + 1,
              Math.floor(((idx + 1) * ordered.length) / maxSamples)
            )
            const chunk = ordered.slice(start, end)
            return chunk.reduce(
              (acc, cur) => ({
                quota: acc.quota + cur.quota,
                count: acc.count + cur.count,
                tokens: acc.tokens + cur.tokens,
                cacheRead: acc.cacheRead + cur.cacheRead,
              }),
              { quota: 0, count: 0, tokens: 0, cacheRead: 0 }
            )
          })

    return {
      quotaPoints: sampled.map((b) => b.quota),
      countPoints: sampled.map((b) => b.count),
      tokenPoints: sampled.map((b) => b.tokens),
      cachePoints: sampled.map((b) => b.cacheRead),
      costPerMPoints: sampled.map((b) =>
        b.tokens > 0 ? (b.quota * 1_000_000) / b.tokens : 0
      ),
      activeModels: modelsSet.size,
      peakCalls: ordered.reduce((mx, b) => Math.max(mx, b.count), 0),
    }
  }, [activeData])

  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const cards = useMemo<KpiCardDescriptor[]>(() => {
    const quotaDisplay = formatQuota(stats.totalQuota)
    const avgQuotaPerReq =
      stats.totalCount > 0 ? stats.totalQuota / stats.totalCount : 0
    const countFormatted = formatStatNumber(stats.totalCount, locale)
    const tokensFormatted = formatStatNumber(stats.totalTokens, locale)
    const avgRpm = safeDivide(stats.totalCount, timeRangeMinutes, 2)
    const avgTpm = safeDivide(stats.totalTokens, timeRangeMinutes, 0)
    const avgTokensPerReq =
      stats.totalCount > 0 ? Math.round(stats.totalTokens / stats.totalCount) : 0

    const cacheDenom = stats.totalTokens + stats.totalCacheReadTokens
    const cacheHitRatio =
      cacheDenom > 0 ? Math.min(1, stats.totalCacheReadTokens / cacheDenom) : 0
    const prevCacheDenom =
      prevStats.totalTokens + prevStats.totalCacheReadTokens
    const prevCacheHitRatio =
      prevCacheDenom > 0
        ? Math.min(1, prevStats.totalCacheReadTokens / prevCacheDenom)
        : 0
    const cacheHitDisplay = `${(cacheHitRatio * 100).toFixed(1)}%`

    const blendedQuotaPerM =
      stats.totalTokens > 0
        ? (stats.totalQuota * 1_000_000) / stats.totalTokens
        : 0
    const prevBlendedQuotaPerM =
      prevStats.totalTokens > 0
        ? (prevStats.totalQuota * 1_000_000) / prevStats.totalTokens
        : 0
    const blendedDisplay = formatQuota(blendedQuotaPerM)

    return [
      {
        key: 'quota',
        title: t('Total Quota'),
        value: quotaDisplay,
        fullValue: quotaDisplay,
        icon: Coins,
        delta: computePercentDelta(stats.totalQuota, prevStats.totalQuota),
        sparklineStrokeClass: 'stroke-foreground/70',
        sparklineFillColor: 'currentColor',
        sparklinePoints: seriesBuckets.quotaPoints,
        metaLeft: `${t('Avg / call')}: ${formatQuota(avgQuotaPerReq)}`,
        metaRight: `${seriesBuckets.activeModels} ${t('models')}`,
      },
      {
        key: 'count',
        title: t('Total Count'),
        value: countFormatted.displayValue,
        fullValue: countFormatted.fullValue,
        icon: Hash,
        delta: computePercentDelta(stats.totalCount, prevStats.totalCount),
        sparklineStrokeClass: 'stroke-sky-500',
        sparklineFillColor: '#0ea5e9',
        sparklinePoints: seriesBuckets.countPoints,
        metaLeft: `${t('Average RPM')}: ${formatNumber(avgRpm, locale)}`,
        metaRight: `${t('Peak')}: ${formatCompactNumber(seriesBuckets.peakCalls, locale)}`,
      },
      {
        key: 'tokens',
        title: t('Total Tokens'),
        value: tokensFormatted.displayValue,
        fullValue: tokensFormatted.fullValue,
        icon: Layers,
        delta: computePercentDelta(stats.totalTokens, prevStats.totalTokens),
        sparklineStrokeClass: 'stroke-violet-500',
        sparklineFillColor: '#8b5cf6',
        sparklinePoints: seriesBuckets.tokenPoints,
        metaLeft: `${t('Average TPM')}: ${formatCompactNumber(avgTpm, locale)}`,
        metaRight: `${formatCompactNumber(avgTokensPerReq, locale)} / ${t('call')}`,
      },
      {
        key: 'cache',
        title: t('Cache Efficiency'),
        value: cacheHitDisplay,
        fullValue: `${cacheHitDisplay} (${formatNumber(stats.totalCacheReadTokens, locale)})`,
        valueClassName: getCacheHitTextClass(cacheHitRatio),
        icon: DatabaseZap,
        delta: computePointDelta(
          cacheHitRatio,
          prevCacheHitRatio,
          prevCacheDenom > 0
        ),
        sparklineStrokeClass: 'stroke-emerald-500',
        sparklineFillColor: '#10b981',
        sparklinePoints: seriesBuckets.cachePoints,
        metaLeft: `${t('Read')}: ${formatCompactNumber(stats.totalCacheReadTokens, locale)}`,
        metaRight: `${t('Write')}: ${formatCompactNumber(stats.totalCacheCreationTokens, locale)}`,
      },
      {
        key: 'blendedCost',
        title: t('Cost / 1M Tokens'),
        value: blendedDisplay,
        fullValue: blendedDisplay,
        icon: Scale,
        delta: computePercentDelta(
          blendedQuotaPerM,
          prevBlendedQuotaPerM,
          true
        ),
        sparklineStrokeClass: 'stroke-amber-500',
        sparklineFillColor: '#f59e0b',
        sparklinePoints: seriesBuckets.costPerMPoints,
        metaLeft: t('Blended unit cost'),
        metaRight: t('vs prev period'),
      },
    ]
  }, [locale, prevStats, seriesBuckets, stats, t, timeRangeMinutes])

  const tokenComposition = useMemo(() => {
    const standard = Math.max(0, stats.totalTokens)
    const cacheRead = Math.max(0, stats.totalCacheReadTokens)
    const cacheWrite = Math.max(0, stats.totalCacheCreationTokens)
    const total = standard + cacheRead + cacheWrite
    if (total <= 0) {
      return {
        total: 0,
        standard,
        cacheRead,
        cacheWrite,
        standardPct: 0,
        cacheReadPct: 0,
        cacheWritePct: 0,
      }
    }
    return {
      total,
      standard,
      cacheRead,
      cacheWrite,
      standardPct: (standard / total) * 100,
      cacheReadPct: (cacheRead / total) * 100,
      cacheWritePct: (cacheWrite / total) * 100,
    }
  }, [stats])

  return (
    <div className='space-y-3'>
      <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {cards.map((card) => {
          const Icon = card.icon
          let primaryDisplay: React.ReactNode
          if (loading) {
            primaryDisplay = (
              <div className='mt-2.5 flex items-end justify-between gap-2'>
                <Skeleton className='h-7 w-20' />
                <Skeleton className='h-7 w-20' />
              </div>
            )
          } else if (error) {
            primaryDisplay = (
              <div className='mt-2.5 flex items-end justify-between gap-2'>
                <div className='text-muted-foreground font-mono text-2xl font-semibold tracking-tight tabular-nums'>
                  --
                </div>
                <MiniSparkline
                  points={[]}
                  strokeClass={card.sparklineStrokeClass}
                  fillColor={card.sparklineFillColor}
                />
              </div>
            )
          } else {
            primaryDisplay = (
              <div className='mt-2.5 flex items-end justify-between gap-2'>
                <div
                  className={cn(
                    'min-w-0 truncate font-mono text-xl font-semibold tracking-tight tabular-nums sm:text-2xl',
                    card.valueClassName ?? 'text-foreground'
                  )}
                  title={card.fullValue}
                >
                  {card.value}
                </div>
                <MiniSparkline
                  points={card.sparklinePoints}
                  strokeClass={card.sparklineStrokeClass}
                  fillColor={card.sparklineFillColor}
                />
              </div>
            )
          }

          return (
            <div
              key={card.key}
              role='group'
              aria-label={card.title}
              aria-busy={loading}
              className='bg-card hover:border-foreground/20 flex flex-col justify-between rounded-xl border p-3.5 transition-colors'
            >
              <div className='flex items-center justify-between gap-1.5'>
                <div className='text-muted-foreground flex min-w-0 items-center gap-1.5'>
                  <Icon className='size-3.5 shrink-0' aria-hidden='true' />
                  <span className='truncate text-xs font-medium'>
                    {card.title}
                  </span>
                </div>
                {!loading && !error ? (
                  <DeltaPill
                    delta={card.delta}
                    title={t('Compared with previous equal period')}
                  />
                ) : null}
              </div>

              {primaryDisplay}

              <div className='border-border/60 text-muted-foreground mt-3 flex items-center justify-between gap-2 border-t pt-2 font-mono text-[11px] tabular-nums'>
                <span className='truncate'>{card.metaLeft}</span>
                <span className='shrink-0'>{card.metaRight}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Token Composition Bar (OpenRouter / OpenAI style) */}
      {!loading && tokenComposition.total > 0 ? (
        <div className='bg-card flex flex-col gap-2 rounded-xl border px-4 py-3 sm:px-5'>
          <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
            <span className='font-medium'>{t('Token Composition')}</span>
            <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums'>
              <span className='inline-flex items-center gap-1.5'>
                <span className='size-2 rounded-full bg-slate-500 dark:bg-slate-400' />
                {t('Standard')}:{' '}
                <strong className='text-foreground font-medium'>
                  {formatCompactNumber(tokenComposition.standard, locale)}
                </strong>{' '}
                ({tokenComposition.standardPct.toFixed(1)}%)
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='size-2 rounded-full bg-emerald-500' />
                {t('Cache Read')}:{' '}
                <strong className='text-emerald-600 dark:text-emerald-400 font-medium'>
                  {formatCompactNumber(tokenComposition.cacheRead, locale)}
                </strong>{' '}
                ({tokenComposition.cacheReadPct.toFixed(1)}%)
              </span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='size-2 rounded-full bg-amber-500' />
                {t('Cache Write')}:{' '}
                <strong className='text-foreground font-medium'>
                  {formatCompactNumber(tokenComposition.cacheWrite, locale)}
                </strong>{' '}
                ({tokenComposition.cacheWritePct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className='bg-muted flex h-2 w-full overflow-hidden rounded-full'>
            <div
              className='h-full bg-slate-500 transition-all duration-300 dark:bg-slate-400'
              style={{ width: `${tokenComposition.standardPct}%` }}
            />
            <div
              className='h-full bg-emerald-500 transition-all duration-300'
              style={{ width: `${tokenComposition.cacheReadPct}%` }}
            />
            <div
              className='h-full bg-amber-500 transition-all duration-300'
              style={{ width: `${tokenComposition.cacheWritePct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
