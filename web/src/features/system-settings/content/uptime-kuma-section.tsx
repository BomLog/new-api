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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Play, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { MultiSelect, type Option } from '@/components/multi-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getChannels } from '@/features/channels/api'
import { triggerChannelProbe } from '@/features/dashboard/api'
import { inferVendorPreset } from '@/features/keys/lib/model-vendor-icons'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type ChannelProbeTarget = {
  id: string
  categoryName: string
  displayName: string
  channelId: number
  models: string[]
  group: string
  prompt?: string
  stream?: boolean
  endpointType?: string
  maxTokens?: number
}

type ChannelProbeOptions = {
  prompt: string
  stream: boolean
  endpointType: string
  maxTokens: number
  timeoutSeconds: number
  queueDelayMs: number
  userBusyWindowSec: number
  maxDeferSec: number
}

type UptimeKumaSectionProps = {
  enabled: boolean
  probeEnabled: boolean
  intervalMinutes: number
  data: string
  options?: string
}

const DEFAULT_PROBE_OPTIONS: ChannelProbeOptions = {
  prompt: 'hi',
  stream: false,
  endpointType: '',
  maxTokens: 16,
  timeoutSeconds: 25,
  queueDelayMs: 500,
  userBusyWindowSec: 30,
  maxDeferSec: 60,
}

const MAX_MODELS_PER_TARGET = 10
const PROBE_TARGET_FORM_ID = 'channel-probe-target-form'
const INTERVAL_PRESETS = [5, 15, 30, 60] as const
const PROMPT_PRESETS = ['hi', 'ping', 'Reply OK'] as const

const ENDPOINT_OPTIONS = [
  { value: '__auto__', apiValue: '', labelKey: 'Auto detect' },
  { value: 'openai', apiValue: 'openai', labelKey: 'OpenAI Chat' },
  {
    value: 'openai-response',
    apiValue: 'openai-response',
    labelKey: 'OpenAI Responses',
  },
  { value: 'anthropic', apiValue: 'anthropic', labelKey: 'Anthropic Messages' },
  { value: 'gemini', apiValue: 'gemini', labelKey: 'Gemini GenerateContent' },
  { value: 'embeddings', apiValue: 'embeddings', labelKey: 'Embeddings' },
  { value: 'jina-rerank', apiValue: 'jina-rerank', labelKey: 'Rerank' },
  {
    value: 'image-generation',
    apiValue: 'image-generation',
    labelKey: 'Image Generation',
  },
] as const

const createProbeTargetSchema = (t: (key: string) => string) =>
  z.object({
    categoryName: z
      .string()
      .min(1, { error: t('Category name is required') })
      .max(50, { error: t('Category name must be less than 50 characters') }),
    displayName: z
      .string()
      .max(80, { error: t('Display name must be less than 80 characters') })
      .optional(),
    channelId: z.number().min(1, { error: t('Please select a channel') }),
    models: z
      .array(z.string())
      .max(MAX_MODELS_PER_TARGET, {
        error: t('Up to 10 models can be selected per target'),
      }),
    group: z.string().max(64).optional(),
    prompt: z.string().max(500).optional(),
    streamMode: z.enum(['inherit', 'non_stream', 'stream']),
    endpointType: z.string().optional(),
    maxTokensText: z.string().optional(),
  })

type ProbeTargetFormValues = z.infer<ReturnType<typeof createProbeTargetSchema>>

function parseProbeOptions(raw?: string): ChannelProbeOptions {
  if (!raw || !raw.trim()) return { ...DEFAULT_PROBE_OPTIONS }
  try {
    const parsed = JSON.parse(raw) as Partial<ChannelProbeOptions>
    return {
      prompt:
        typeof parsed.prompt === 'string' && parsed.prompt.trim()
          ? parsed.prompt.trim()
          : DEFAULT_PROBE_OPTIONS.prompt,
      stream: Boolean(parsed.stream),
      endpointType:
        typeof parsed.endpointType === 'string' ? parsed.endpointType : '',
      maxTokens:
        typeof parsed.maxTokens === 'number' && parsed.maxTokens >= 0
          ? parsed.maxTokens
          : DEFAULT_PROBE_OPTIONS.maxTokens,
      timeoutSeconds:
        typeof parsed.timeoutSeconds === 'number' &&
        parsed.timeoutSeconds >= 5 &&
        parsed.timeoutSeconds <= 120
          ? parsed.timeoutSeconds
          : DEFAULT_PROBE_OPTIONS.timeoutSeconds,
      queueDelayMs:
        typeof parsed.queueDelayMs === 'number' &&
        parsed.queueDelayMs >= 0 &&
        parsed.queueDelayMs <= 10000
          ? parsed.queueDelayMs
          : DEFAULT_PROBE_OPTIONS.queueDelayMs,
      userBusyWindowSec:
        typeof parsed.userBusyWindowSec === 'number' &&
        parsed.userBusyWindowSec >= 0 &&
        parsed.userBusyWindowSec <= 300
          ? parsed.userBusyWindowSec
          : DEFAULT_PROBE_OPTIONS.userBusyWindowSec,
      maxDeferSec:
        typeof parsed.maxDeferSec === 'number' &&
        parsed.maxDeferSec >= 0 &&
        parsed.maxDeferSec <= 600
          ? parsed.maxDeferSec
          : DEFAULT_PROBE_OPTIONS.maxDeferSec,
    }
  } catch {
    return { ...DEFAULT_PROBE_OPTIONS }
  }
}

function parseProbeTargets(raw: string): ChannelProbeTarget[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, idx) => ({
      id: String(item.id || `target-${idx + 1}`),
      categoryName: String(item.categoryName || ''),
      displayName: String(item.displayName || ''),
      channelId: Number(item.channelId || 0),
      models: Array.isArray(item.models)
        ? item.models.map((m: unknown) => String(m).trim()).filter(Boolean)
        : [],
      group: String(item.group || ''),
      prompt: typeof item.prompt === 'string' ? item.prompt : undefined,
      stream: typeof item.stream === 'boolean' ? item.stream : undefined,
      endpointType:
        typeof item.endpointType === 'string' ? item.endpointType : undefined,
      maxTokens:
        typeof item.maxTokens === 'number' && item.maxTokens > 0
          ? item.maxTokens
          : undefined,
    }))
  } catch {
    return []
  }
}

function toStreamMode(stream?: boolean): 'inherit' | 'non_stream' | 'stream' {
  if (stream === true) return 'stream'
  if (stream === false) return 'non_stream'
  return 'inherit'
}

export function UptimeKumaSection(props: UptimeKumaSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const schema = createProbeTargetSchema(t)

  const [isEnabled, setIsEnabled] = useState(props.enabled)
  const [isProbeEnabled, setIsProbeEnabled] = useState(props.probeEnabled)
  const [intervalValue, setIntervalValue] = useState(
    props.intervalMinutes || 15
  )
  const [probeOptions, setProbeOptions] = useState<ChannelProbeOptions>(() =>
    parseProbeOptions(props.options)
  )
  const [hasOptionChanges, setHasOptionChanges] = useState(false)
  const [targets, setTargets] = useState<ChannelProbeTarget[]>(() =>
    parseProbeTargets(props.data)
  )
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingTarget, setEditingTarget] =
    useState<ChannelProbeTarget | null>(null)
  const [deleteMode, setDeleteMode] = useState<'single' | 'batch'>('single')
  const [isProbing, setIsProbing] = useState(false)

  const { data: channelsData } = useQuery({
    queryKey: ['channel-probe-channel-options'],
    queryFn: async () =>
      requireServerSuccess(await getChannels({ p: 1, page_size: 100 })),
    staleTime: 60 * 1000,
  })

  const channels = useMemo(() => {
    const raw = channelsData?.data
    if (Array.isArray(raw)) return raw
    return raw?.items ?? []
  }, [channelsData])

  const channelMap = useMemo(
    () => new Map(channels.map((ch) => [ch.id, ch])),
    [channels]
  )

  const endpointSelectItems = useMemo(
    () =>
      ENDPOINT_OPTIONS.map((item) => ({
        value: item.value,
        label: t(item.labelKey),
      })),
    [t]
  )

  const targetEndpointItems = useMemo(
    () => [
      { value: '__inherit__', label: t('Inherit global default') },
      ...ENDPOINT_OPTIONS.filter((item) => item.value !== '__auto__').map(
        (item) => ({
          value: item.value,
          label: t(item.labelKey),
        })
      ),
    ],
    [t]
  )

  const streamModeItems = useMemo(
    () => [
      {
        value: 'inherit',
        label: probeOptions.stream
          ? t('Inherit global (Stream)')
          : t('Inherit global (Non-stream)'),
      },
      { value: 'non_stream', label: t('Non-stream') },
      { value: 'stream', label: t('Stream') },
    ],
    [probeOptions.stream, t]
  )

  const form = useForm<ProbeTargetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryName: '',
      displayName: '',
      channelId: 0,
      models: [],
      group: '',
      prompt: '',
      streamMode: 'inherit',
      endpointType: '__inherit__',
      maxTokensText: '',
    },
  })

  const selectedChannelId = form.watch('channelId')
  const selectedChannel = channelMap.get(selectedChannelId)

  const selectedChannelModelOptions = useMemo<Option[]>(() => {
    if (!selectedChannel?.models) return []
    const defaultModel = selectedChannel.test_model?.trim() || ''
    const seen = new Set<string>()
    const result: Option[] = []
    for (const rawModel of selectedChannel.models.split(',')) {
      const modelName = rawModel.trim()
      if (!modelName || seen.has(modelName)) continue
      seen.add(modelName)
      result.push({
        value: modelName,
        label: modelName,
        hint:
          defaultModel && modelName === defaultModel
            ? t('Channel default')
            : undefined,
      })
    }
    if (defaultModel && !seen.has(defaultModel)) {
      result.unshift({
        value: defaultModel,
        label: defaultModel,
        hint: t('Channel default'),
      })
    }
    return result
  }, [selectedChannel, t])

  useEffect(() => {
    setTargets(parseProbeTargets(props.data))
  }, [props.data])

  useEffect(() => {
    setProbeOptions(parseProbeOptions(props.options))
    setHasOptionChanges(false)
  }, [props.options])

  useEffect(() => {
    setIsEnabled(props.enabled)
  }, [props.enabled])

  useEffect(() => {
    setIsProbeEnabled(props.probeEnabled)
  }, [props.probeEnabled])

  useEffect(() => {
    setIntervalValue(props.intervalMinutes || 15)
  }, [props.intervalMinutes])

  const patchProbeOptions = (patch: Partial<ChannelProbeOptions>) => {
    setProbeOptions((prev) => ({ ...prev, ...patch }))
    setHasOptionChanges(true)
  }

  const handleTogglePanelEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.uptime_kuma_enabled',
        value: checked,
      })
      setIsEnabled(checked)
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleToggleProbeEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.channel_probe_enabled',
        value: checked,
      })
      setIsProbeEnabled(checked)
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleSaveInterval = async (nextMinutes: number) => {
    const clamped = Math.min(1440, Math.max(1, Math.round(nextMinutes)))
    setIntervalValue(clamped)
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.channel_probe_interval_minutes',
        value: clamped,
      })
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleSaveProbeOptions = async () => {
    const normalized: ChannelProbeOptions = {
      prompt: probeOptions.prompt.trim() || 'hi',
      stream: Boolean(probeOptions.stream),
      endpointType: probeOptions.endpointType.trim(),
      maxTokens: Math.min(16384, Math.max(0, Math.round(probeOptions.maxTokens))),
      timeoutSeconds: Math.min(
        120,
        Math.max(5, Math.round(probeOptions.timeoutSeconds || 25))
      ),
      queueDelayMs: Math.min(
        10000,
        Math.max(0, Math.round(probeOptions.queueDelayMs))
      ),
      userBusyWindowSec: Math.min(
        300,
        Math.max(0, Math.round(probeOptions.userBusyWindowSec))
      ),
      maxDeferSec: Math.min(
        600,
        Math.max(0, Math.round(probeOptions.maxDeferSec))
      ),
    }
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.channel_probe_options',
        value: JSON.stringify(normalized),
      })
      setProbeOptions(normalized)
      setHasOptionChanges(false)
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleRunProbeNow = async () => {
    setIsProbing(true)
    try {
      const res = await triggerChannelProbe()
      if (res.success && res.data) {
        const deferred = res.data.summary.deferred ?? 0
        if (deferred > 0) {
          toast.success(
            t(
              'Probe completed: {{succeeded}}/{{total}} succeeded ({{deferred}} deferred)',
              {
                succeeded: res.data.summary.succeeded,
                total: res.data.summary.total,
                deferred,
              }
            )
          )
        } else {
          toast.success(
            t('Probe completed: {{succeeded}}/{{total}} succeeded', {
              succeeded: res.data.summary.succeeded,
              total: res.data.summary.total,
            })
          )
        }
      }
    } catch (error) {
      handleServerError(error, t('Failed to run channel probe'))
    } finally {
      setIsProbing(false)
    }
  }

  const handleAutoPopulate = () => {
    const enabledChannels = channels.filter((ch) => ch.status === 1)
    if (enabledChannels.length === 0) {
      toast.error(t('No enabled channels available'))
      return
    }

    const generated: ChannelProbeTarget[] = enabledChannels
      .slice(0, 20)
      .map((ch, idx) => {
        const firstModel = (ch.models || '')
          .split(',')
          .map((m) => m.trim())
          .find(Boolean)
        const primaryModel = ch.test_model?.trim() || firstModel || ''
        const preset = inferVendorPreset(primaryModel)
        const firstGroup = (ch.group || '').split(',')[0]?.trim() || ''
        return {
          id: `auto-${ch.id}-${idx + 1}`,
          categoryName: preset?.name || firstGroup || 'General',
          displayName: primaryModel || `Channel #${ch.id}`,
          channelId: ch.id,
          models: primaryModel ? [primaryModel] : [],
          group: firstGroup,
        }
      })

    setTargets(generated)
    setHasChanges(true)
    toast.success(
      t('Generated {{count}} probe target(s). Click Save to apply.', {
        count: generated.length,
      })
    )
  }

  const handleAdd = () => {
    setEditingTarget(null)
    const defaultChannel = channels.find((ch) => ch.status === 1) ?? channels[0]
    const defaultModel =
      defaultChannel?.test_model?.trim() ||
      (defaultChannel?.models || '')
        .split(',')
        .map((m) => m.trim())
        .find(Boolean) ||
      ''
    const preset = inferVendorPreset(defaultModel)
    form.reset({
      categoryName: preset?.name || '',
      displayName: '',
      channelId: defaultChannel?.id ?? 0,
      models: defaultModel ? [defaultModel] : [],
      group: (defaultChannel?.group || '').split(',')[0]?.trim() || '',
      prompt: '',
      streamMode: 'inherit',
      endpointType: '__inherit__',
      maxTokensText: '',
    })
    setShowDialog(true)
  }

  const handleEdit = (target: ChannelProbeTarget) => {
    setEditingTarget(target)
    form.reset({
      categoryName: target.categoryName,
      displayName: target.displayName,
      channelId: target.channelId,
      models: target.models,
      group: target.group,
      prompt: target.prompt || '',
      streamMode: toStreamMode(target.stream),
      endpointType: target.endpointType || '__inherit__',
      maxTokensText: target.maxTokens ? String(target.maxTokens) : '',
    })
    setShowDialog(true)
  }

  const handleDelete = (target: ChannelProbeTarget) => {
    setEditingTarget(target)
    setDeleteMode('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    setDeleteMode('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteMode === 'single' && editingTarget) {
      setTargets((prev) => prev.filter((item) => item.id !== editingTarget.id))
    } else {
      const selectedSet = new Set(selectedIds)
      setTargets((prev) => prev.filter((item) => !selectedSet.has(item.id)))
      setSelectedIds([])
    }
    setHasChanges(true)
    setShowDeleteDialog(false)
    setEditingTarget(null)
  }

  const handleSubmitForm = (values: ProbeTargetFormValues) => {
    const models = values.models
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, MAX_MODELS_PER_TARGET)

    let streamOverride: boolean | undefined
    if (values.streamMode === 'stream') streamOverride = true
    if (values.streamMode === 'non_stream') streamOverride = false

    const parsedMaxTokens = Number.parseInt(
      (values.maxTokensText || '').trim(),
      10
    )
    const maxTokens =
      Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
        ? Math.min(16384, parsedMaxTokens)
        : undefined

    const endpointType =
      values.endpointType && values.endpointType !== '__inherit__'
        ? values.endpointType
        : undefined

    const nextItem: ChannelProbeTarget = {
      id: editingTarget?.id || `probe-${Date.now()}`,
      categoryName: values.categoryName.trim(),
      displayName: values.displayName?.trim() || '',
      channelId: values.channelId,
      models,
      group: values.group?.trim() || '',
      prompt: values.prompt?.trim() || undefined,
      stream: streamOverride,
      endpointType,
      maxTokens,
    }

    if (editingTarget) {
      setTargets((prev) =>
        prev.map((item) => (item.id === editingTarget.id ? nextItem : item))
      )
    } else {
      setTargets((prev) => [...prev, nextItem])
    }
    setHasChanges(true)
    setShowDialog(false)
    setEditingTarget(null)
  }

  const handleSaveTargets = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.channel_probe_targets',
        value: JSON.stringify(targets),
      })
      setHasChanges(false)
    } catch (error) {
      handleServerError(error, t('Failed to save channel probe targets'))
    }
  }

  const columns: StaticDataTableColumn<ChannelProbeTarget>[] = [
    {
      id: 'select',
      className: 'w-10',
      header: (
        <Checkbox
          checked={targets.length > 0 && selectedIds.length === targets.length}
          onCheckedChange={(checked) => {
            setSelectedIds(checked ? targets.map((item) => item.id) : [])
          }}
        />
      ),
      cell: (row) => (
        <Checkbox
          checked={selectedIds.includes(row.id)}
          onCheckedChange={(checked) => {
            setSelectedIds((prev) =>
              checked
                ? [...prev, row.id]
                : prev.filter((id) => id !== row.id)
            )
          }}
        />
      ),
    },
    {
      id: 'categoryName',
      header: t('Category'),
      cell: (row) => <Badge variant='secondary'>{row.categoryName}</Badge>,
    },
    {
      id: 'displayName',
      header: t('Display Name'),
      cell: (row) => (
        <span className='font-medium'>
          {row.displayName || row.models[0] || '-'}
        </span>
      ),
    },
    {
      id: 'channelId',
      header: t('Channel'),
      cell: (row) => {
        const ch = channelMap.get(row.channelId)
        return (
          <span className='font-mono text-xs'>
            #{row.channelId} {ch ? `(${ch.name})` : ''}
          </span>
        )
      },
    },
    {
      id: 'models',
      header: t('Models'),
      cell: (row) => (
        <div className='flex flex-wrap gap-1'>
          {row.models.length > 0 ? (
            row.models.map((m) => (
              <Badge key={m} variant='outline' className='font-mono text-[11px]'>
                {m}
              </Badge>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t('Default channel model')}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'probeConfig',
      header: t('Probe Options'),
      cell: (row) => {
        const isStream =
          row.stream === undefined ? probeOptions.stream : row.stream
        const prompt = row.prompt?.trim() || probeOptions.prompt || 'hi'
        return (
          <div className='flex flex-wrap items-center gap-1'>
            <Badge variant='secondary' className='text-[11px]'>
              {isStream ? t('Stream') : t('Non-stream')}
            </Badge>
            <Badge
              variant='outline'
              className='max-w-[140px] truncate font-mono text-[11px]'
              title={prompt}
            >
              {prompt}
            </Badge>
            {row.endpointType ? (
              <Badge variant='outline' className='font-mono text-[11px]'>
                {row.endpointType}
              </Badge>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'actions',
      className: 'w-24 text-right',
      header: t('Actions'),
      cell: (row) => (
        <StaticRowActions
          editLabel={t('Edit')}
          deleteLabel={t('Delete')}
          menuLabel={t('Actions')}
          onEdit={() => handleEdit(row)}
          onDelete={() => handleDelete(row)}
        />
      ),
    },
  ]

  return (
    <div className='space-y-6'>
      <SettingsSection title={t('Channel Health Monitor')}>
        <p className='text-muted-foreground -mt-2 text-sm'>
          {t(
            'Replace external Uptime Kuma with built-in periodic channel model probes and a commercial availability status panel.'
          )}
        </p>
        <div className='space-y-4'>
          <SettingsSwitchField
            label={t('Enable Availability Status Panel')}
            description={t(
              'Display channel success rates and 30-check heartbeat bars on the overview dashboard.'
            )}
            checked={isEnabled}
            onCheckedChange={(checked) => void handleTogglePanelEnabled(checked)}
            disabled={updateOption.isPending}
          />

          <SettingsSwitchField
            label={t('Enable Scheduled Model Probing')}
            description={t(
              'Automatically test configured channels and models on a schedule to record uptime and latency history.'
            )}
            checked={isProbeEnabled}
            onCheckedChange={(checked) => void handleToggleProbeEnabled(checked)}
            disabled={updateOption.isPending}
          />

          <div className='border-border/70 bg-muted/20 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5'>
            <div className='space-y-0.5'>
              <div className='text-sm font-medium'>
                {t('Probe Interval (Minutes)')}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'How frequently the background scheduler probes configured channels and models.'
                )}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              {INTERVAL_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type='button'
                  size='sm'
                  variant={intervalValue === preset ? 'default' : 'outline'}
                  className='h-8 px-2.5 font-mono text-xs'
                  onClick={() => void handleSaveInterval(preset)}
                  disabled={updateOption.isPending}
                >
                  {preset}m
                </Button>
              ))}
              <Input
                type='number'
                min={1}
                max={1440}
                value={intervalValue}
                onChange={(e) =>
                  setIntervalValue(Number.parseInt(e.target.value, 10) || 15)
                }
                onBlur={() => void handleSaveInterval(intervalValue)}
                className='h-8 w-20 font-mono text-xs'
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('Probe Queue & Custom Options')}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Customize probe request parameters and queue deferral when channels are serving live user traffic.'
            )}
          </p>
          {hasOptionChanges ? (
            <Button
              type='button'
              size='sm'
              onClick={() => void handleSaveProbeOptions()}
              disabled={updateOption.isPending}
            >
              <Save className='mr-1.5 size-3.5' aria-hidden='true' />
              {t('Save probe options')}
            </Button>
          ) : null}
        </div>

        <div className='border-border/70 bg-muted/20 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3'>
          <div className='space-y-2 sm:col-span-2 lg:col-span-2'>
            <Label htmlFor='probe-default-prompt'>{t('Probe Prompt')}</Label>
            <div className='flex flex-wrap items-center gap-2'>
              <Input
                id='probe-default-prompt'
                value={probeOptions.prompt}
                onChange={(e) => patchProbeOptions({ prompt: e.target.value })}
                placeholder='hi'
                className='min-w-[180px] flex-1 font-mono text-xs'
              />
              {PROMPT_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type='button'
                  size='sm'
                  variant={
                    probeOptions.prompt === preset ? 'secondary' : 'outline'
                  }
                  className='h-8 px-2.5 font-mono text-xs'
                  onClick={() => patchProbeOptions({ prompt: preset })}
                >
                  {preset}
                </Button>
              ))}
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Default message sent to models during probes (for example "hi").'
              )}
            </p>
          </div>

          <div className='space-y-2'>
            <Label>{t('Request Mode')}</Label>
            <div className='grid grid-cols-2 gap-1.5'>
              <Button
                type='button'
                size='sm'
                variant={probeOptions.stream ? 'outline' : 'default'}
                onClick={() => patchProbeOptions({ stream: false })}
              >
                {t('Non-stream')}
              </Button>
              <Button
                type='button'
                size='sm'
                variant={probeOptions.stream ? 'default' : 'outline'}
                onClick={() => patchProbeOptions({ stream: true })}
              >
                {t('Stream')}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Choose non-streaming or SSE streaming for scheduled probes.')}
            </p>
          </div>

          <div className='space-y-2'>
            <Label>{t('Default Endpoint')}</Label>
            <Select
              items={endpointSelectItems}
              value={probeOptions.endpointType || '__auto__'}
              onValueChange={(val) => {
                const matched = ENDPOINT_OPTIONS.find(
                  (item) => item.value === val
                )
                patchProbeOptions({ endpointType: matched?.apiValue ?? '' })
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('Auto detect')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {ENDPOINT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='probe-max-tokens'>{t('Max Tokens')}</Label>
            <Input
              id='probe-max-tokens'
              type='number'
              min={0}
              max={16384}
              value={probeOptions.maxTokens}
              onChange={(e) =>
                patchProbeOptions({
                  maxTokens: Math.max(
                    0,
                    Number.parseInt(e.target.value, 10) || 0
                  ),
                })
              }
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Keep small (e.g. 16) to minimize probe token usage.')}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='probe-timeout-sec'>
              {t('Single Probe Timeout (Seconds)')}
            </Label>
            <Input
              id='probe-timeout-sec'
              type='number'
              min={5}
              max={120}
              value={probeOptions.timeoutSeconds}
              onChange={(e) =>
                patchProbeOptions({
                  timeoutSeconds: Number.parseInt(e.target.value, 10) || 25,
                })
              }
              className='font-mono text-xs'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='probe-queue-delay'>
              {t('Queue Spacing (ms)')}
            </Label>
            <Input
              id='probe-queue-delay'
              type='number'
              min={0}
              max={10000}
              step={100}
              value={probeOptions.queueDelayMs}
              onChange={(e) =>
                patchProbeOptions({
                  queueDelayMs: Math.max(
                    0,
                    Number.parseInt(e.target.value, 10) || 0
                  ),
                })
              }
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Delay between queued probes to avoid bursting upstreams.')}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='probe-busy-window'>
              {t('Defer on User Traffic Window (Seconds)')}
            </Label>
            <Input
              id='probe-busy-window'
              type='number'
              min={0}
              max={300}
              value={probeOptions.userBusyWindowSec}
              onChange={(e) =>
                patchProbeOptions({
                  userBusyWindowSec: Math.max(
                    0,
                    Number.parseInt(e.target.value, 10) || 0
                  ),
                })
              }
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Defer scheduled probes when a channel had user calls within this window (0 disables deferral).'
              )}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='probe-max-defer'>
              {t('Max Defer Wait (Seconds)')}
            </Label>
            <Input
              id='probe-max-defer'
              type='number'
              min={0}
              max={600}
              value={probeOptions.maxDeferSec}
              onChange={(e) =>
                patchProbeOptions({
                  maxDeferSec: Math.max(
                    0,
                    Number.parseInt(e.target.value, 10) || 0
                  ),
                })
              }
              className='font-mono text-xs'
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Skip this round without marking failure if the channel stays busy longer than this.'
              )}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('Probe Targets')}>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Choose which channels and models to probe. If left empty, enabled channels are auto-discovered using their default model.'
            )}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => void handleRunProbeNow()}
              disabled={isProbing}
            >
              <Play className='mr-1.5 size-3.5' aria-hidden='true' />
              {isProbing ? t('Probing...') : t('Probe now')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleAutoPopulate}
            >
              <Sparkles className='mr-1.5 size-3.5' aria-hidden='true' />
              {t('Auto-populate')}
            </Button>
            <Button type='button' size='sm' onClick={handleAdd}>
              <Plus className='mr-1.5 size-3.5' aria-hidden='true' />
              {t('Add Target')}
            </Button>
            {selectedIds.length > 0 ? (
              <Button
                type='button'
                variant='destructive'
                size='sm'
                onClick={handleBatchDelete}
              >
                <Trash2 className='mr-1.5 size-3.5' aria-hidden='true' />
                {t('Delete Selected')} ({selectedIds.length})
              </Button>
            ) : null}
            {hasChanges ? (
              <Button
                type='button'
                size='sm'
                onClick={() => void handleSaveTargets()}
                disabled={updateOption.isPending}
              >
                <Save className='mr-1.5 size-3.5' aria-hidden='true' />
                {t('Save changes')}
              </Button>
            ) : null}
          </div>
        </div>

        <StaticDataTable
          columns={columns}
          data={targets}
          getRowKey={(row) => row.id}
          emptyContent={t(
            'No custom probe targets yet. Enabled channels will be auto-probed, or click "Auto-populate" to customize.'
          )}
        />
      </SettingsSection>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={editingTarget ? t('Edit Probe Target') : t('Add Probe Target')}
        description={t(
          'Select a channel and models to probe periodically. Display name is shown publicly on the status panel.'
        )}
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={PROBE_TARGET_FORM_ID}>
              {t('Confirm')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={PROBE_TARGET_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='channelId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Channel')}</FormLabel>
                  <Select
                    items={channels.map((ch) => ({
                      value: String(ch.id),
                      label: `#${ch.id} · ${ch.name}`,
                    }))}
                    value={field.value ? String(field.value) : null}
                    onValueChange={(val) => {
                      const nextId = Number.parseInt(val || '0', 10)
                      field.onChange(nextId)
                      const ch = channelMap.get(nextId)
                      if (ch) {
                        const channelModels = (ch.models || '')
                          .split(',')
                          .map((m) => m.trim())
                          .filter(Boolean)
                        const firstModel =
                          ch.test_model?.trim() || channelModels[0] || ''
                        const currentModels = form.getValues('models')
                        const validKept = currentModels.filter((m) =>
                          channelModels.includes(m)
                        )
                        if (validKept.length > 0) {
                          form.setValue('models', validKept)
                        } else if (firstModel) {
                          form.setValue('models', [firstModel])
                        } else {
                          form.setValue('models', [])
                        }
                        if (!form.getValues('categoryName')) {
                          const preset = inferVendorPreset(firstModel)
                          form.setValue(
                            'categoryName',
                            preset?.name || 'General'
                          )
                        }
                        if (!form.getValues('group')) {
                          const firstGroup =
                            (ch.group || '').split(',')[0]?.trim() || ''
                          form.setValue('group', firstGroup)
                        }
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder={t('Select a channel')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {channels.map((ch) => (
                          <SelectItem key={ch.id} value={String(ch.id)}>
                            #{ch.id} · {ch.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='models'
              render={({ field }) => (
                <FormItem>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <FormLabel>{t('Models to Probe')}</FormLabel>
                    <div className='flex items-center gap-1.5'>
                      <span className='text-muted-foreground font-mono text-xs'>
                        {field.value.length}/{MAX_MODELS_PER_TARGET}
                      </span>
                      {selectedChannelModelOptions.length > 0 ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          onClick={() => {
                            field.onChange(
                              selectedChannelModelOptions
                                .slice(0, MAX_MODELS_PER_TARGET)
                                .map((opt) => opt.value)
                            )
                          }}
                        >
                          {t('Select first 10')}
                        </Button>
                      ) : null}
                      {field.value.length > 0 ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          onClick={() => field.onChange([])}
                        >
                          {t('Clear')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <MultiSelect
                    options={selectedChannelModelOptions}
                    selected={field.value}
                    onChange={(next) => {
                      if (next.length > MAX_MODELS_PER_TARGET) {
                        toast.warning(
                          t('Up to 10 models can be selected per target')
                        )
                        field.onChange(next.slice(0, MAX_MODELS_PER_TARGET))
                        return
                      }
                      field.onChange(next)
                    }}
                    placeholder={t('Select models from this channel...')}
                    emptyText={t('No models in this channel')}
                    allowCreate
                    maxVisibleChips={6}
                  />
                  <FormDescription className='text-xs'>
                    {t(
                      'Select one or more models from the multi-select menu (leave empty to use the channel default model).'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid gap-3 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='categoryName'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Category')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('e.g. OpenAI, Anthropic')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='displayName'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Display Name')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Optional public label')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='border-border/70 bg-muted/20 space-y-3 rounded-lg border p-3'>
              <div className='text-xs font-medium'>
                {t('Custom Probe Overrides (Optional)')}
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='streamMode'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Request Mode')}</FormLabel>
                      <Select
                        items={streamModeItems}
                        value={field.value}
                        onValueChange={(val) => {
                          if (
                            val === 'inherit' ||
                            val === 'non_stream' ||
                            val === 'stream'
                          ) {
                            field.onChange(val)
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {streamModeItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='endpointType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Endpoint Override')}</FormLabel>
                      <Select
                        items={targetEndpointItems}
                        value={field.value || '__inherit__'}
                        onValueChange={(val) =>
                          field.onChange(val || '__inherit__')
                        }
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {targetEndpointItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid gap-3 sm:grid-cols-3'>
                <FormField
                  control={form.control}
                  name='prompt'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>{t('Probe Prompt')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('Leave empty to use global ({{prompt}})', {
                            prompt: probeOptions.prompt || 'hi',
                          })}
                          className='font-mono text-xs'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='maxTokensText'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Max Tokens')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={0}
                          max={16384}
                          placeholder={String(probeOptions.maxTokens)}
                          className='font-mono text-xs'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name='group'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Group')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('e.g. default, vip')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('Confirm Delete')}
        desc={
          deleteMode === 'single'
            ? t('Are you sure you want to remove this probe target?')
            : t('Are you sure you want to remove {{count}} selected targets?', {
                count: selectedIds.length,
              })
        }
        destructive
        handleConfirm={confirmDelete}
      />
    </div>
  )
}
