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
import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, Layers, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getDashboardChartColors } from '@/features/dashboard/lib/charts'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortMetric = 'quota' | 'count' | 'tokens'

interface ModelBreakdownRow {
  model: string
  quota: number
  count: number
  tokens: number
  cacheRead: number
  cacheCreation: number
  cacheHitRatio: number
  share: number
  color: string
}

interface ModelBreakdownPanelProps {
  data: QuotaDataItem[]
  loading?: boolean
  selectedModel?: string | null
  onSelectModel?: (model: string | null) => void
}

const SORT_OPTIONS: { value: SortMetric; labelKey: string }[] = [
  { value: 'quota', labelKey: 'Quota' },
  { value: 'count', labelKey: 'Calls' },
  { value: 'tokens', labelKey: 'Tokens' },
]

function getCacheBadgeClass(ratio: number): string {
  if (ratio >= 0.7) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  }
  if (ratio >= 0.4) {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
  }
  if (ratio >= 0.15) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  if (ratio > 0) {
    return 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400'
  }
  return 'border-border/70 bg-muted/40 text-muted-foreground'
}

export function ModelBreakdownPanel(props: ModelBreakdownPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState<SortMetric>('quota')
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const rows = useMemo<ModelBreakdownRow[]>(() => {
    if (props.loading || !props.data.length) return []

    const map = new Map<
      string,
      {
        quota: number
        count: number
        tokens: number
        cacheRead: number
        cacheCreation: number
      }
    >()

    for (const item of props.data) {
      const model = item.model_name || 'Unknown'
      const prev = map.get(model) ?? {
        quota: 0,
        count: 0,
        tokens: 0,
        cacheRead: 0,
        cacheCreation: 0,
      }
      map.set(model, {
        quota: prev.quota + (Number(item.quota) || 0),
        count: prev.count + (Number(item.count) || 0),
        tokens: prev.tokens + (Number(item.token_used) || 0),
        cacheRead:
          prev.cacheRead + Math.max(0, Number(item.cache_read_tokens) || 0),
        cacheCreation:
          prev.cacheCreation +
          Math.max(0, Number(item.cache_creation_tokens) || 0),
      })
    }

    const sorted = [...map.entries()].sort((a, b) => {
      if (sortBy === 'count') return b[1].count - a[1].count
      if (sortBy === 'tokens') return b[1].tokens - a[1].tokens
      return b[1].quota - a[1].quota
    })

    const totalMetric = sorted.reduce((acc, [, stats]) => {
      if (sortBy === 'count') return acc + stats.count
      if (sortBy === 'tokens') return acc + stats.tokens
      return acc + stats.quota
    }, 0)

    const palette = getDashboardChartColors(Math.max(sorted.length, 6))

    return sorted.map(([model, stats], index) => {
      let metricVal = stats.quota
      if (sortBy === 'count') metricVal = stats.count
      if (sortBy === 'tokens') metricVal = stats.tokens

      const share = totalMetric > 0 ? metricVal / totalMetric : 0
      const cacheDenom = stats.tokens + stats.cacheRead
      const cacheHitRatio =
        cacheDenom > 0 ? Math.min(1, stats.cacheRead / cacheDenom) : 0

      return {
        model,
        quota: stats.quota,
        count: stats.count,
        tokens: stats.tokens,
        cacheRead: stats.cacheRead,
        cacheCreation: stats.cacheCreation,
        cacheHitRatio,
        share,
        color: palette[index % palette.length] || '#3b82f6',
      }
    })
  }, [props.data, props.loading, sortBy])

  const formatMetricValue = (row: ModelBreakdownRow) => {
    if (sortBy === 'quota') return formatQuota(row.quota)
    if (sortBy === 'count') return formatNumber(row.count, locale)
    return formatCompactNumber(row.tokens, locale)
  }

  let listContent: React.ReactNode
  if (props.loading) {
    listContent = (
      <div className='space-y-2.5'>
        {['m1', 'm2', 'm3', 'm4', 'm5'].map((key) => (
          <div key={key} className='space-y-2 rounded-lg border p-3'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-4 w-36' />
              <Skeleton className='h-4 w-16' />
            </div>
            <Skeleton className='h-1.5 w-full rounded-full' />
          </div>
        ))}
      </div>
    )
  } else if (rows.length === 0) {
    listContent = (
      <div className='text-muted-foreground flex h-56 items-center justify-center text-xs'>
        {t('No data available')}
      </div>
    )
  } else {
    listContent = (
      <div className='space-y-2'>
        {rows.map((row, idx) => {
          const isSelected = props.selectedModel === row.model
          const isDimmed = Boolean(props.selectedModel && !isSelected)
          const sharePercent = (row.share * 100).toFixed(1)
          const cachePct = Math.round(row.cacheHitRatio * 100)

          return (
            <div
              key={row.model}
              className={cn(
                'group hover:border-foreground/20 rounded-lg border p-3 transition-colors',
                isSelected
                  ? 'border-primary/60 bg-primary/5 ring-primary/15 ring-2'
                  : 'border-border/80 bg-background/60',
                isDimmed && 'opacity-55 hover:opacity-100'
              )}
            >
              <div className='flex items-center justify-between gap-2'>
                <button
                  type='button'
                  onClick={() =>
                    props.onSelectModel?.(isSelected ? null : row.model)
                  }
                  className='flex min-w-0 flex-1 items-center gap-2 text-left'
                >
                  <span className='text-muted-foreground w-4 shrink-0 font-mono text-[11px] tabular-nums'>
                    {idx + 1}
                  </span>
                  <span
                    className='size-2 shrink-0 rounded-full'
                    style={{ backgroundColor: row.color }}
                    aria-hidden='true'
                  />
                  <span
                    className='text-foreground truncate font-mono text-xs font-semibold'
                    title={row.model}
                  >
                    {row.model}
                  </span>
                  <Badge
                    variant='outline'
                    className={cn(
                      'h-5 shrink-0 px-1.5 font-mono text-[10px] font-medium tabular-nums',
                      getCacheBadgeClass(row.cacheHitRatio)
                    )}
                  >
                    {t('Cache')} {cachePct}%
                  </Badge>
                </button>

                <div className='flex shrink-0 items-center gap-1'>
                  <span className='text-foreground font-mono text-xs font-semibold tabular-nums'>
                    {formatMetricValue(row)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='text-muted-foreground hover:text-foreground size-6'
                          aria-label={t('View model logs')}
                          onClick={() => {
                            void navigate({
                              to: '/usage-logs/$section',
                              params: { section: 'common' },
                              search: { model: row.model },
                            })
                          }}
                        />
                      }
                    >
                      <ExternalLink className='size-3' />
                    </TooltipTrigger>
                    <TooltipContent>{t('View model logs')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <button
                type='button'
                onClick={() =>
                  props.onSelectModel?.(isSelected ? null : row.model)
                }
                className='block w-full text-left'
              >
                <div className='mt-2 flex items-center gap-2.5'>
                  <div className='bg-muted h-1.5 flex-1 overflow-hidden rounded-full'>
                    <div
                      className='h-full rounded-full transition-all duration-300'
                      style={{
                        width: `${Math.max(3, Math.min(100, row.share * 100))}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                  <span className='text-muted-foreground w-10 text-right font-mono text-[11px] tabular-nums'>
                    {sharePercent}%
                  </span>
                </div>

                <div className='text-muted-foreground mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]'>
                  <span className='font-mono tabular-nums'>
                    {formatNumber(row.count, locale)} {t('calls')}
                  </span>
                  <span className='font-mono tabular-nums'>
                    {formatCompactNumber(row.tokens, locale)} {t('tokens')}
                  </span>
                  <span className='font-mono tabular-nums'>
                    {formatQuota(row.quota)}
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className='bg-card flex h-full flex-col overflow-hidden rounded-xl border'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <div className='bg-muted flex size-7 shrink-0 items-center justify-center rounded-md border'>
            <Layers className='text-foreground size-3.5' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold'>
              {t('Model Cost & Efficiency')}
            </div>
            <div className='text-muted-foreground text-[11px]'>
              {t('Click a model row to focus the entire dashboard')}
            </div>
          </div>
        </div>

        <div className='bg-muted/60 inline-flex h-8 rounded-lg border p-0.5'>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type='button'
              onClick={() => setSortBy(opt.value)}
              className={cn(
                'rounded-md px-2.5 text-xs font-medium transition-colors',
                sortBy === opt.value
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {props.selectedModel ? (
        <div className='bg-primary/5 flex items-center justify-between gap-2 border-b px-4 py-2 text-xs sm:px-5'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <Sparkles className='text-primary size-3.5 shrink-0' />
            <span className='text-muted-foreground'>{t('Focused model:')}</span>
            <span className='text-foreground truncate font-mono font-semibold'>
              {props.selectedModel}
            </span>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-6 px-2 text-xs'
            onClick={() => props.onSelectModel?.(null)}
          >
            <X className='mr-1 size-3' />
            {t('Clear')}
          </Button>
        </div>
      ) : null}

      <div className='min-h-0 flex-1 overflow-y-auto p-3 sm:max-h-[416px] sm:p-4'>
        {listContent}
      </div>
    </div>
  )
}
