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
import { Gauge, HeartPulse, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getDashboardPerfMetricsSummary } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

const PERFORMANCE_WINDOW_HOURS = 24
const TOP_MODEL_LIMIT = 6

interface PerformanceOverviewProps {
  selectedModel?: string | null
  onSelectModel?: (model: string | null) => void
}

function getSuccessRateBarClass(rate: number): string {
  if (rate >= 0.99) return 'bg-emerald-500'
  if (rate >= 0.95) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function PerformanceOverview(props: PerformanceOverviewProps) {
  const { t } = useTranslation()
  const metricsQuery = useQuery({
    queryKey: ['dashboard-perf-metrics-summary', PERFORMANCE_WINDOW_HOURS],
    queryFn: async () =>
      requireServerSuccess(
        await getDashboardPerfMetricsSummary(PERFORMANCE_WINDOW_HOURS)
      ),
    staleTime: 60 * 1000,
    retry: false,
  })

  const models = useMemo(
    () => metricsQuery.data?.data.models ?? [],
    [metricsQuery.data]
  )
  const summary = metricsQuery.data?.data.summary
  const topModels = useMemo(() => models.slice(0, TOP_MODEL_LIMIT), [models])
  const loading = metricsQuery.isLoading
  const hasData = models.length > 0

  if (!loading && !hasData) {
    return (
      <div className='bg-card text-muted-foreground overflow-hidden rounded-xl border px-4 py-3 text-center text-xs'>
        {t('No performance data available')}
      </div>
    )
  }

  const overallRate = summary?.success_rate ?? Number.NaN

  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2.5'>
          <span className='relative flex size-2'>
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-50',
                getSuccessRateDotClass(overallRate)
              )}
            />
            <span
              className={cn(
                'relative inline-flex size-2 rounded-full',
                getSuccessRateDotClass(overallRate)
              )}
            />
          </span>
          <div>
            <div className='text-sm font-semibold'>
              {t('Performance health')}
            </div>
            <div className='text-muted-foreground text-[11px]'>
              {t('Rolling 24h gateway SLA & model runtime telemetry')}
            </div>
          </div>
        </div>

        {loading ? (
          <div className='flex flex-wrap items-center gap-2'>
            {['success', 'latency', 'throughput'].map((key) => (
              <Skeleton key={key} className='h-8 w-28 rounded-lg' />
            ))}
          </div>
        ) : (
          <div className='flex flex-wrap items-center gap-2'>
            <MetricPill
              icon={HeartPulse}
              label={t('Success rate')}
              value={formatUptimePct(overallRate)}
              valueClassName={getSuccessRateTextClass(overallRate)}
            />
            <MetricPill
              icon={Timer}
              label={t('Average latency')}
              value={formatLatency(summary?.avg_latency_ms ?? 0)}
            />
            <MetricPill
              icon={Gauge}
              label={t('Throughput')}
              value={formatThroughput(summary?.avg_tps ?? 0)}
            />
          </div>
        )}
      </div>

      {!loading && hasData ? (
        <div className='grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6 sm:px-5'>
          {topModels.map((model) => (
            <ModelHealthChip
              key={model.model_name}
              model={model}
              selected={props.selectedModel === model.model_name}
              onClick={
                props.onSelectModel
                  ? () =>
                      props.onSelectModel?.(
                        props.selectedModel === model.model_name
                          ? null
                          : model.model_name
                      )
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MetricPill(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClassName?: string
}) {
  const Icon = props.icon

  return (
    <div className='bg-muted/40 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5'>
      <Icon
        className='text-muted-foreground size-3.5 shrink-0'
        aria-hidden='true'
      />
      <span className='text-muted-foreground text-[11px]'>{props.label}</span>
      <span
        className={cn(
          'font-mono text-xs font-semibold tabular-nums',
          props.valueClassName ?? 'text-foreground'
        )}
      >
        {props.value}
      </span>
    </div>
  )
}

function ModelHealthChip(props: {
  model: PerfModelSummary
  selected: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const model = props.model
  const pct = Number.isFinite(model.success_rate)
    ? Math.max(0, Math.min(100, model.success_rate * 100))
    : 0

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            onClick={props.onClick}
            className={cn(
              'bg-background/70 hover:border-foreground/20 flex min-w-0 flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors',
              props.selected &&
                'border-primary/60 bg-primary/5 ring-primary/15 ring-2'
            )}
          />
        }
      >
        <div className='flex items-center justify-between gap-1.5'>
          <span
            className='text-foreground truncate font-mono text-[11px] font-medium'
            title={model.model_name}
          >
            {model.model_name}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[11px] font-semibold tabular-nums',
              getSuccessRateTextClass(model.success_rate)
            )}
          >
            {formatUptimePct(model.success_rate)}
          </span>
        </div>
        <div className='bg-muted h-1 w-full overflow-hidden rounded-full'>
          <div
            className={cn(
              'h-full rounded-full transition-all',
              getSuccessRateBarClass(model.success_rate)
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className='space-y-0.5 text-xs'>
          <div className='font-mono font-semibold'>{model.model_name}</div>
          <div>
            {t('Average latency')}: {formatLatency(model.avg_latency_ms)}
          </div>
          <div>
            {t('Throughput')}: {formatThroughput(model.avg_tps)}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
