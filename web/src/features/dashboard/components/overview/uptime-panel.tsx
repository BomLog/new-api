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
import { Activity, Cpu, Play, RotateCw } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ROLE } from '@/lib/roles'
import {
  getUptimeStatus,
  triggerChannelProbe,
} from '@/features/dashboard/api'
import type {
  ProbeHeartbeat,
  UptimeGroupResult,
  UptimeMonitor,
} from '@/features/dashboard/types'
import { resolveModelIconKey } from '@/features/keys/lib/model-vendor-icons'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { PanelWrapper } from '../ui/panel-wrapper'

const HEARTBEAT_SLOT_COUNT = 30
const SLOW_LATENCY_THRESHOLD_MS = 3000

const STATUS_DOT_CLASS: Record<number, string> = {
  1: 'bg-emerald-500',
  2: 'bg-amber-500',
  0: 'bg-rose-500',
  3: 'bg-muted-foreground/40',
}

function getSuccessRateTextClass(pct: number, totalChecks: number): string {
  if (totalChecks <= 0) return 'text-muted-foreground'
  if (pct >= 99) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 95) return 'text-sky-600 dark:text-sky-400'
  if (pct >= 80) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getStatusLabelKey(status: number): string {
  if (status === 1) return 'Operational'
  if (status === 2) return 'Degraded'
  if (status === 0) return 'Outage'
  return 'Pending'
}

function getStatusBadgeClass(status: number): string {
  if (status === 1) {
    return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
  }
  if (status === 2) {
    return 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300'
  }
  if (status === 0) {
    return 'border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300'
  }
  return 'border-border/70 bg-muted/50 text-muted-foreground'
}

function formatProbeTime(ts: number, locale: string): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatLatency(ms?: number): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

const HeartbeatBars = memo(function HeartbeatBars(props: {
  heartbeats: ProbeHeartbeat[]
  locale: string
  okLabel: string
  slowLabel: string
  failLabel: string
  noDataLabel: string
}) {
  const recent = props.heartbeats.slice(-HEARTBEAT_SLOT_COUNT)
  const padCount = Math.max(0, HEARTBEAT_SLOT_COUNT - recent.length)
  const slots = [
    ...Array.from({ length: padCount }, (_, n) => ({
      slotKey: `pad-${HEARTBEAT_SLOT_COUNT - n}`,
      beat: null as ProbeHeartbeat | null,
    })),
    ...recent.map((beat, n) => ({
      slotKey: `beat-${beat.t}-${beat.ms}-${padCount + n}`,
      beat,
    })),
  ]

  return (
    <div
      data-slot='uptime-heartbeat-bars'
      className='flex h-5 w-full items-stretch gap-[2px]'
    >
      {slots.map(({ slotKey, beat }) => {
        if (!beat) {
          return (
            <span
              key={slotKey}
              title={props.noDataLabel}
              className='bg-muted/70 flex-1 rounded-[2px]'
            />
          )
        }
        let barColor = 'bg-emerald-500/85 hover:bg-emerald-500'
        let stateText = props.okLabel
        if (!beat.ok) {
          barColor = 'bg-rose-500/85 hover:bg-rose-500'
          stateText = props.failLabel
        } else if (beat.ms > SLOW_LATENCY_THRESHOLD_MS) {
          barColor = 'bg-amber-500/85 hover:bg-amber-500'
          stateText = props.slowLabel
        }
        const timeStr = formatProbeTime(beat.t, props.locale)
        const latencyStr = formatLatency(beat.ms)
        const title = [timeStr, stateText, latencyStr]
          .filter(Boolean)
          .join(' · ')
        return (
          <span
            key={slotKey}
            data-slot='uptime-heartbeat-bar'
            data-status={beat.ok ? 'ok' : 'fail'}
            title={title}
            className={cn(
              'flex-1 rounded-[2px] transition-transform hover:scale-y-110',
              barColor
            )}
          />
        )
      })}
    </div>
  )
})

const MonitorRow = memo(function MonitorRow(props: {
  monitor: UptimeMonitor
  locale: string
  isLastInGroup: boolean
  isLastGroup: boolean
}) {
  const { t } = useTranslation()
  const { monitor } = props
  const totalChecks = monitor.totalChecks ?? monitor.heartbeats?.length ?? 0
  const uptimePct = (monitor.uptime ?? 0) * 100
  const formattedPct =
    totalChecks > 0 ? `${uptimePct.toFixed(uptimePct >= 99.95 ? 2 : 1)}%` : '--'
  const latencyText = formatLatency(
    monitor.avgLatencyMs || monitor.lastLatencyMs
  )
  const iconKey = resolveModelIconKey(monitor.model || monitor.name)
  const modelIcon = iconKey ? getLobeIcon(iconKey, 15) : null
  const dotColor =
    STATUS_DOT_CLASS[monitor.status] ?? 'bg-muted-foreground/40'

  return (
    <div
      data-slot='uptime-monitor-row'
      className={cn(
        'hover:bg-muted/30 space-y-2 px-3.5 py-2.5 transition-colors sm:px-4',
        !props.isLastInGroup && 'border-border/40 border-b',
        !props.isLastGroup && props.isLastInGroup && 'border-border/60 border-b'
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            aria-hidden='true'
            className='border-border/60 bg-background/80 flex size-6 shrink-0 items-center justify-center rounded-md border'
          >
            {modelIcon ?? (
              <Cpu className='text-muted-foreground size-3.5' />
            )}
          </span>
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span
                className='truncate text-xs font-medium sm:text-sm'
                title={monitor.name}
              >
                {monitor.name}
              </span>
              {monitor.group ? (
                <Badge
                  variant='secondary'
                  className='h-4 shrink-0 rounded px-1.5 text-[10px] font-normal'
                >
                  {monitor.group}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          {latencyText ? (
            <span className='text-muted-foreground hidden font-mono text-[11px] tabular-nums sm:inline'>
              {latencyText}
            </span>
          ) : null}
          <span
            data-slot='uptime-monitor-rate'
            className={cn(
              'font-mono text-xs font-semibold tabular-nums sm:text-sm',
              getSuccessRateTextClass(uptimePct, totalChecks)
            )}
          >
            {formattedPct}
          </span>
          <span
            className={cn(
              'inline-flex h-4 items-center gap-1 rounded border px-1.5 text-[10px] font-medium',
              getStatusBadgeClass(monitor.status)
            )}
          >
            <span className={cn('size-1.5 rounded-full', dotColor)} />
            <span>{t(getStatusLabelKey(monitor.status))}</span>
          </span>
        </div>
      </div>

      <HeartbeatBars
        heartbeats={monitor.heartbeats ?? []}
        locale={props.locale}
        okLabel={t('Operational')}
        slowLabel={t('Degraded')}
        failLabel={t('Outage')}
        noDataLabel={t('No probe data')}
      />

      <div className='text-muted-foreground/70 flex items-center justify-between text-[10px] tabular-nums'>
        <span>{t('Last {{count}} checks', { count: HEARTBEAT_SLOT_COUNT })}</span>
        <span>
          {monitor.lastCheckedAt
            ? formatProbeTime(monitor.lastCheckedAt, props.locale)
            : t('Awaiting probe')}
        </span>
      </div>
    </div>
  )
})

export function UptimePanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((s) => s.auth.user)
  const isSuperAdmin = (user?.role ?? 0) >= ROLE.SUPER_ADMIN
  const [groups, setGroups] = useState<UptimeGroupResult[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [probing, setProbing] = useState(false)

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    const res = await getUptimeStatus()
    if (signal?.aborted) return
    setGroups(res?.data || [])
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    void fetchStatus(abortController.signal)
      .catch(() => {
        if (!abortController.signal.aborted) setGroups([])
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false)
      })
    return () => abortController.abort()
  }, [fetchStatus])

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchStatus()
      .catch(() => setGroups([]))
      .finally(() => setRefreshing(false))
  }

  const handleRunProbe = async () => {
    setProbing(true)
    try {
      const res = await triggerChannelProbe()
      if (res.success && res.data) {
        setGroups(res.data.groups || [])
        toast.success(
          t('Probe completed: {{succeeded}}/{{total}} succeeded', {
            succeeded: res.data.summary.succeeded,
            total: res.data.summary.total,
          })
        )
      }
    } catch (error) {
      handleServerError(error, t('Failed to run channel probe'))
    } finally {
      setProbing(false)
    }
  }

  const overview = useMemo(() => {
    const allMonitors = groups.flatMap((g) => g.monitors || [])
    let totalChecks = 0
    let totalSuccess = 0
    let latencySum = 0
    let latencyCount = 0
    let hasOutage = false
    let hasDegraded = false

    for (const m of allMonitors) {
      const checks = m.totalChecks ?? m.heartbeats?.length ?? 0
      const succ =
        m.successChecks ??
        (m.heartbeats
          ? m.heartbeats.filter((b) => b.ok).length
          : Math.round((m.uptime ?? 0) * checks))
      totalChecks += checks
      totalSuccess += succ
      if (m.avgLatencyMs && m.avgLatencyMs > 0) {
        latencySum += m.avgLatencyMs
        latencyCount++
      }
      if (m.status === 0) hasOutage = true
      if (m.status === 2) hasDegraded = true
    }

    const overallPct =
      totalChecks > 0 ? (totalSuccess / totalChecks) * 100 : null
    const avgLatencyMs =
      latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0

    let bannerTone: 'operational' | 'degraded' | 'outage' | 'pending' =
      'pending'
    if (totalChecks > 0) {
      if (hasOutage) {
        bannerTone = 'outage'
      } else if (hasDegraded || (overallPct !== null && overallPct < 99)) {
        bannerTone = 'degraded'
      } else {
        bannerTone = 'operational'
      }
    }

    return {
      monitorCount: allMonitors.length,
      overallPct,
      avgLatencyMs,
      bannerTone,
    }
  }, [groups])

  let bannerBgClass = 'border-border/60 bg-muted/25'
  let bannerDotClass = 'bg-muted-foreground/50'
  let bannerText = t('Awaiting first probe')
  if (overview.bannerTone === 'operational') {
    bannerBgClass = 'border-emerald-500/25 bg-emerald-500/8'
    bannerDotClass = 'bg-emerald-500'
    bannerText = t('All channels operational')
  } else if (overview.bannerTone === 'degraded') {
    bannerBgClass = 'border-amber-500/25 bg-amber-500/8'
    bannerDotClass = 'bg-amber-500'
    bannerText = t('Partial performance degradation')
  } else if (overview.bannerTone === 'outage') {
    bannerBgClass = 'border-rose-500/25 bg-rose-500/8'
    bannerDotClass = 'bg-rose-500'
    bannerText = t('Channel availability disruption')
  }

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <IconBadge tone='success' size='sm'>
            <Activity />
          </IconBadge>
          {t('Channel Availability')}
        </span>
      }
      description={t('Built-in scheduled channel & model health probes')}
      loading={loading}
      empty={!groups.length}
      emptyMessage={t('No channel probes configured')}
      height='h-[420px]'
      contentClassName='p-0'
      headerActions={
        <div className='flex items-center gap-1'>
          {isSuperAdmin ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => void handleRunProbe()}
              disabled={probing || refreshing}
              title={t('Probe now')}
              aria-label={t('Probe now')}
              className='h-7 gap-1 px-2 text-xs'
            >
              <Play
                className={cn('size-3', probing && 'animate-pulse')}
                aria-hidden='true'
              />
              <span className='hidden sm:inline'>{t('Probe now')}</span>
            </Button>
          ) : null}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={handleRefresh}
            disabled={refreshing || probing}
            aria-label={t('Refresh')}
            className='size-7 p-0'
          >
            <RotateCw
              className={cn('size-3.5', refreshing && 'animate-spin')}
              aria-hidden='true'
            />
          </Button>
        </div>
      }
    >
      <div className='flex h-[420px] flex-col'>
        {/* Commercial Statuspage-style overall summary banner */}
        <div
          data-slot='uptime-overall-banner'
          className={cn(
            'flex items-center justify-between gap-3 border-b px-3.5 py-2.5 sm:px-4',
            bannerBgClass
          )}
        >
          <div className='flex min-w-0 items-center gap-2'>
            <span className='relative flex size-2.5 shrink-0'>
              {overview.bannerTone !== 'pending' ? (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                    bannerDotClass
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-2.5 rounded-full',
                  bannerDotClass
                )}
              />
            </span>
            <span className='truncate text-xs font-semibold'>{bannerText}</span>
          </div>
          <div className='flex shrink-0 items-baseline gap-2'>
            {overview.avgLatencyMs > 0 ? (
              <span className='text-muted-foreground font-mono text-[11px] tabular-nums'>
                {formatLatency(overview.avgLatencyMs)}
              </span>
            ) : null}
            <span
              data-slot='uptime-overall-rate'
              className={cn(
                'font-mono text-sm font-bold tabular-nums',
                getSuccessRateTextClass(
                  overview.overallPct ?? 0,
                  overview.overallPct === null ? 0 : 1
                )
              )}
            >
              {overview.overallPct !== null
                ? `${overview.overallPct.toFixed(2)}%`
                : '--'}
            </span>
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          {groups.map((group, groupIdx) => {
              const monitors = group.monitors || []
              const checkedMonitors = monitors.filter(
                (m) => (m.totalChecks ?? m.heartbeats?.length ?? 0) > 0
              )
              const groupAvgPct =
                checkedMonitors.length > 0
                  ? (checkedMonitors.reduce(
                      (acc, m) => acc + (m.uptime ?? 0),
                      0
                    ) /
                      checkedMonitors.length) *
                    100
                  : null

              return (
                <div key={group.categoryName}>
                  <div className='bg-muted/30 border-border/60 flex items-center justify-between gap-2 border-b px-3.5 py-1.5 sm:px-4'>
                    <div className='flex items-center gap-2'>
                      <h4 className='text-muted-foreground text-[11px] font-semibold tracking-wider uppercase'>
                        {group.categoryName}
                      </h4>
                      <span className='text-muted-foreground/50 font-mono text-[11px] tabular-nums'>
                        {monitors.length}
                      </span>
                    </div>
                    {groupAvgPct !== null ? (
                      <span
                        className={cn(
                          'font-mono text-[11px] font-semibold tabular-nums',
                          getSuccessRateTextClass(groupAvgPct, 1)
                        )}
                      >
                        {groupAvgPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </div>

                  {monitors.map((monitor, monitorIdx) => (
                    <MonitorRow
                      key={monitor.id || `${group.categoryName}-${monitor.name}`}
                      monitor={monitor}
                      locale={locale}
                      isLastInGroup={monitorIdx === monitors.length - 1}
                      isLastGroup={groupIdx === groups.length - 1}
                    />
                  ))}
                </div>
              )
            })}
        </div>
      </div>
    </PanelWrapper>
  )
}
