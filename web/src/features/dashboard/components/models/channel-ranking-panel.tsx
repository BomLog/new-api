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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, Route, Trophy } from 'lucide-react'
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
import { getFlowQuotaDates } from '@/features/dashboard/api'
import {
  buildQueryParams,
  getDefaultDays,
} from '@/features/dashboard/lib'
import { getDashboardChartColors } from '@/features/dashboard/lib/charts'
import type {
  DashboardFilters,
  FlowQuotaDataItem,
} from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'
import { cn } from '@/lib/utils'

type ChannelSortMetric = 'quota' | 'count' | 'tokens'

interface ChannelRankingRow {
  channelId: number
  channelName: string
  quota: number
  count: number
  tokens: number
  avgQuotaPerCall: number
  share: number
  models: string[]
  color: string
}

interface ChannelRankingPanelProps {
  filters?: DashboardFilters
  selectedModel?: string | null
}

const SORT_OPTIONS: { value: ChannelSortMetric; labelKey: string }[] = [
  { value: 'quota', labelKey: 'Quota' },
  { value: 'count', labelKey: 'Calls' },
  { value: 'tokens', labelKey: 'Tokens' },
]

function getRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'border-amber-500/40 bg-amber-500/12 text-amber-600 dark:text-amber-400'
  }
  if (rank === 2) {
    return 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300'
  }
  if (rank === 3) {
    return 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-400'
  }
  return 'border-border bg-muted/50 text-muted-foreground'
}

export function ChannelRankingPanel(props: ChannelRankingPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState<ChannelSortMetric>('quota')
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const queryParams = useMemo(() => {
    const range = computeTimeRange(
      getDefaultDays(props.filters?.time_granularity),
      props.filters?.start_timestamp,
      props.filters?.end_timestamp
    )
    return buildQueryParams(range, props.filters)
  }, [props.filters])

  const flowQuery = useQuery({
    queryKey: ['dashboard', 'channel-ranking', queryParams],
    queryFn: async () =>
      requireServerSuccess(await getFlowQuotaDates(queryParams, true)),
    select: (res): FlowQuotaDataItem[] => (res.success ? (res.data ?? []) : []),
    staleTime: 60_000,
    retry: false,
  })

  const { rows, totalQuota, topChannel } = useMemo(() => {
    const raw = flowQuery.data ?? []
    const filtered = props.selectedModel
      ? raw.filter((item) => item.model_name === props.selectedModel)
      : raw

    const byChannel = new Map<
      number,
      {
        channelName: string
        quota: number
        count: number
        tokens: number
        models: Set<string>
      }
    >()

    for (const item of filtered) {
      const channelId = Number(item.channel_id) || 0
      if (channelId <= 0) continue
      const existing = byChannel.get(channelId) ?? {
        channelName: item.channel_name?.trim() || `#${channelId}`,
        quota: 0,
        count: 0,
        tokens: 0,
        models: new Set<string>(),
      }
      if (item.channel_name?.trim()) {
        existing.channelName = item.channel_name.trim()
      }
      existing.quota += Number(item.quota) || 0
      existing.count += Number(item.count) || 0
      existing.tokens += Number(item.token_used) || 0
      if (item.model_name) {
        existing.models.add(item.model_name)
      }
      byChannel.set(channelId, existing)
    }

    const sorted = [...byChannel.entries()].sort((a, b) => {
      if (sortBy === 'count') return b[1].count - a[1].count
      if (sortBy === 'tokens') return b[1].tokens - a[1].tokens
      return b[1].quota - a[1].quota
    })

    const metricTotal = sorted.reduce((acc, [, entry]) => {
      if (sortBy === 'count') return acc + entry.count
      if (sortBy === 'tokens') return acc + entry.tokens
      return acc + entry.quota
    }, 0)

    const quotaSum = sorted.reduce((acc, [, entry]) => acc + entry.quota, 0)
    const palette = getDashboardChartColors(Math.max(sorted.length, 6))

    const rankingRows: ChannelRankingRow[] = sorted.map(
      ([channelId, entry], idx) => {
        let metricVal = entry.quota
        if (sortBy === 'count') metricVal = entry.count
        if (sortBy === 'tokens') metricVal = entry.tokens

        return {
          channelId,
          channelName: entry.channelName,
          quota: entry.quota,
          count: entry.count,
          tokens: entry.tokens,
          avgQuotaPerCall: entry.count > 0 ? entry.quota / entry.count : 0,
          share: metricTotal > 0 ? metricVal / metricTotal : 0,
          models: [...entry.models],
          color: palette[idx % palette.length] || '#2563eb',
        }
      }
    )

    return {
      rows: rankingRows,
      totalQuota: quotaSum,
      topChannel: rankingRows[0] ?? null,
    }
  }, [flowQuery.data, props.selectedModel, sortBy])

  const formatPrimaryValue = (row: ChannelRankingRow) => {
    if (sortBy === 'quota') return formatQuota(row.quota)
    if (sortBy === 'count') return formatNumber(row.count, locale)
    return formatCompactNumber(row.tokens, locale)
  }

  let bodyContent: React.ReactNode
  if (flowQuery.isLoading) {
    bodyContent = (
      <div className='grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2 sm:px-5'>
        {['c1', 'c2', 'c3', 'c4'].map((key) => (
          <div key={key} className='space-y-2 rounded-lg border p-3'>
            <div className='flex items-center justify-between'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-4 w-16' />
            </div>
            <Skeleton className='h-1.5 w-full rounded-full' />
            <Skeleton className='h-3 w-48' />
          </div>
        ))}
      </div>
    )
  } else if (rows.length === 0) {
    bodyContent = (
      <div className='text-muted-foreground px-4 py-8 text-center text-xs'>
        {t('No channel consumption data in this period')}
      </div>
    )
  } else {
    bodyContent = (
      <div className='grid grid-cols-1 gap-2.5 p-4 md:grid-cols-2 sm:px-5'>
        {rows.map((row, idx) => {
          const rank = idx + 1
          const sharePct = (row.share * 100).toFixed(1)
          return (
            <div
              key={row.channelId}
              className='bg-background/60 hover:border-foreground/20 group flex flex-col justify-between gap-2 rounded-lg border p-3 transition-colors'
            >
              <div className='flex items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-md border px-1 font-mono text-[11px] font-semibold tabular-nums',
                      getRankBadgeClass(rank)
                    )}
                  >
                    #{rank}
                  </span>
                  <span
                    className='size-2 shrink-0 rounded-full'
                    style={{ backgroundColor: row.color }}
                    aria-hidden='true'
                  />
                  <span
                    className='text-foreground truncate text-xs font-semibold'
                    title={`#${row.channelId} ${row.channelName}`}
                  >
                    {row.channelName}
                  </span>
                  <span className='text-muted-foreground shrink-0 font-mono text-[11px]'>
                    ID {row.channelId}
                  </span>
                </div>

                <div className='flex shrink-0 items-center gap-1.5'>
                  <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                    {formatPrimaryValue(row)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='text-muted-foreground hover:text-foreground size-6'
                          aria-label={t('View channel logs')}
                          onClick={() => {
                            void navigate({
                              to: '/usage-logs/$section',
                              params: { section: 'common' },
                              search: {
                                channel: String(row.channelId),
                                model: props.selectedModel || undefined,
                              },
                            })
                          }}
                        />
                      }
                    >
                      <ExternalLink className='size-3.5' />
                    </TooltipTrigger>
                    <TooltipContent>{t('View channel logs')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className='flex items-center gap-2.5'>
                <div className='bg-muted h-1.5 flex-1 overflow-hidden rounded-full'>
                  <div
                    className='h-full rounded-full transition-all duration-300'
                    style={{
                      width: `${Math.max(3, Math.min(100, row.share * 100))}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
                <span className='text-muted-foreground w-11 text-right font-mono text-[11px] tabular-nums'>
                  {sharePct}%
                </span>
              </div>

              <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-[11px]'>
                <div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono tabular-nums'>
                  <span>{formatQuota(row.quota)}</span>
                  <span>
                    {formatNumber(row.count, locale)} {t('calls')}
                  </span>
                  <span>
                    {formatCompactNumber(row.tokens, locale)} {t('tokens')}
                  </span>
                  <span className='hidden sm:inline'>
                    {t('Avg / call')}: {formatQuota(row.avgQuotaPerCall)}
                  </span>
                </div>
                {row.models.length > 0 ? (
                  <span className='text-muted-foreground/80 truncate font-mono text-[10px]'>
                    {row.models.slice(0, 2).join(', ')}
                    {row.models.length > 2 ? ` +${row.models.length - 2}` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3 sm:px-5'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <div className='bg-muted flex size-7 shrink-0 items-center justify-center rounded-md border'>
            <Route className='text-foreground size-3.5' aria-hidden='true' />
          </div>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-semibold'>
                {t('Channel Spend Ranking')}
              </span>
              {topChannel ? (
                <Badge
                  variant='secondary'
                  className='gap-1 font-mono text-[11px] font-medium tabular-nums'
                >
                  <Trophy className='size-3 text-amber-500' />
                  <span>
                    {topChannel.channelName} ·{' '}
                    {(topChannel.share * 100).toFixed(1)}%
                  </span>
                </Badge>
              ) : null}
            </div>
            <div className='text-muted-foreground mt-0.5 text-[11px]'>
              {t(
                'Admin channel spend leaderboard · Total {{total}} across {{count}} channels',
                {
                  total: formatQuota(totalQuota),
                  count: rows.length,
                }
              )}
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

      {bodyContent}
    </div>
  )
}
