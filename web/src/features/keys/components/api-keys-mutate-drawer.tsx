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
import {
  ChevronDown,
  Cpu,
  KeyRound,
  Lock,
  Shield,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RelatedPolicyLink } from '@/features/system-settings/request-policies/related-policy-link'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { getUserGroups, getUserModels } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { getLobeIcon } from '@/lib/lobe-icon'
import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  createApiKey,
  getApiKey,
  getTokenAutoGroups,
  updateApiKey,
} from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  getApiKeyFormSchema,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
} from '../lib'
import { resolveModelIconKey } from '../lib/model-vendor-icons'
import type { ApiKey } from '../types'
import {
  ApiKeyCreatedView,
  type CreatedApiKeySummary,
} from './api-key-created-view'
import type { ApiKeyGroupOption } from './api-key-group-combobox'
import { ApiKeyVendorGroupPicker } from './api-key-vendor-group-picker'
import { useApiKeys } from './api-keys-provider'
import { AutoGroupOrderEditor } from './auto-group-order-editor'

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
}

type ExpiryKey = 'never' | '1h' | '1d' | '7d' | '1m' | '1y' | 'custom'

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: ApiKeyMutateDrawerProps) {
  const { i18n, t } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const isUpdate = !!currentRow
  const currentRowId = currentRow?.id
  const { triggerRefresh } = useApiKeys()
  const { status, loading: statusLoading } = useStatus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [activeExpiry, setActiveExpiry] = useState<ExpiryKey>('never')
  const [createdSummary, setCreatedSummary] =
    useState<CreatedApiKeySummary | null>(null)
  const [initializedTarget, setInitializedTarget] = useState<string | null>(
    null
  )
  const defaultUseAutoGroup = status?.default_use_auto_group === true

  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: async () => requireServerSuccess(await getUserModels()),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const {
    data: groupsData,
    isFetched: groupsFetched,
    isFetching: groupsFetching,
  } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const {
    data: apiKeyData,
    isFetched: apiKeyFetched,
    isFetching: apiKeyFetching,
  } = useQuery({
    queryKey: ['api-key', currentRowId],
    queryFn: async () =>
      requireServerSuccess(await getApiKey(currentRowId ?? 0)),
    enabled: open && isUpdate && currentRowId !== undefined,
    staleTime: 0,
  })

  const {
    data: autoGroupsData,
    isFetched: autoGroupsFetched,
    isFetching: autoGroupsFetching,
  } = useQuery({
    queryKey: ['token-auto-groups'],
    queryFn: async () => requireServerSuccess(await getTokenAutoGroups()),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const models = useMemo(() => modelsData?.data ?? [], [modelsData])
  const modelOptions = useMemo(
    () =>
      models.map((modelName) => {
        const iconKey = resolveModelIconKey(modelName)
        const icon = iconKey ? (
          getLobeIcon(iconKey, 15)
        ) : (
          <Cpu className='text-muted-foreground size-3.5' aria-hidden='true' />
        )
        return {
          label: modelName,
          value: modelName,
          icon,
        }
      }),
    [models]
  )
  const groups = useMemo<ApiKeyGroupOption[]>(
    () =>
      Object.entries(groupsData?.data || {}).map(([key, info]) => ({
        value: key,
        label: key,
        desc: info.desc ? translateServerText(t, info.desc) : key,
        ratio: info.ratio,
      })),
    [groupsData, t]
  )
  const backendHasAuto = groups.some((g) => g.value === 'auto')
  const availableAutoGroupNames = useMemo(
    () => groups.filter((group) => group.value !== 'auto').map((g) => g.value),
    [groups]
  )
  const resolvedCreateGroup = useMemo(() => {
    if (defaultUseAutoGroup && backendHasAuto) return 'auto'
    return (
      groups.find((g) => g.value === 'default')?.value ??
      availableAutoGroupNames[0] ??
      groups[0]?.value ??
      ''
    )
  }, [defaultUseAutoGroup, backendHasAuto, groups, availableAutoGroupNames])
  const globalAutoGroups = useMemo(() => {
    const available = new Set(availableAutoGroupNames)
    return (autoGroupsData?.data?.groups || []).filter((group) =>
      available.has(group)
    )
  }, [autoGroupsData, availableAutoGroupNames])
  const globalAutoGroupOptions = useMemo(() => {
    const groupsByValue = new Map(groups.map((group) => [group.value, group]))
    return globalAutoGroups.flatMap((group) => {
      const option = groupsByValue.get(group)
      return option ? [option] : []
    })
  }, [globalAutoGroups, groups])
  const maxAutoGroups =
    Number.isInteger(autoGroupsData?.data?.max_count) &&
    Number(autoGroupsData?.data?.max_count) > 0
      ? Number(autoGroupsData?.data?.max_count)
      : 5
  const schema = useMemo(
    () => getApiKeyFormSchema(t, maxAutoGroups),
    [t, maxAutoGroups]
  )

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(defaultUseAutoGroup),
  })

  useEffect(() => {
    if (!open) {
      form.reset({
        ...getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto),
        group: resolvedCreateGroup,
      })
      setInitializedTarget(null)
      setCreatedSummary(null)
      setActiveExpiry('never')
      setAdvancedOpen(false)
      return
    }
    if (
      !groupsFetched ||
      groupsFetching ||
      !autoGroupsFetched ||
      autoGroupsFetching
    ) {
      return
    }
    if (isUpdate && (!apiKeyFetched || apiKeyFetching)) return
    if (!isUpdate && statusLoading) return

    const target = isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
    if (initializedTarget === target) return
    if (isUpdate && currentRow) {
      if (apiKeyData?.success && apiKeyData.data) {
        const defaults = transformApiKeyToFormDefaults(
          apiKeyData.data,
          availableAutoGroupNames,
          maxAutoGroups
        )
        form.reset(defaults)
        setActiveExpiry(defaults.expired_time ? 'custom' : 'never')
        setAdvancedOpen(
          defaults.model_limits.length > 0 ||
            (defaults.allow_ips ?? '').trim().length > 0
        )
        setCreatedSummary(null)
        setInitializedTarget(target)
      }
    } else {
      form.reset({
        ...getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto),
        group: resolvedCreateGroup,
      })
      setActiveExpiry('never')
      setAdvancedOpen(false)
      setCreatedSummary(null)
      setInitializedTarget(target)
    }
  }, [
    open,
    isUpdate,
    currentRow,
    form,
    defaultUseAutoGroup,
    statusLoading,
    backendHasAuto,
    resolvedCreateGroup,
    groupsFetched,
    groupsFetching,
    autoGroupsFetched,
    autoGroupsFetching,
    apiKeyData,
    apiKeyFetched,
    apiKeyFetching,
    availableAutoGroupNames,
    maxAutoGroups,
    initializedTarget,
  ])

  const formTarget =
    isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
  const isFormInitialized = initializedTarget === formTarget
  const selectedGroup = form.watch('group')
  const autoGroupsMode = form.watch('auto_groups_mode')
  const unlimitedQuota = form.watch('unlimited_quota')
  const remainQuota = form.watch('remain_quota_dollars') ?? 0
  const expiredTime = form.watch('expired_time')
  const tokenCount = form.watch('tokenCount') || 1
  const modelLimits = form.watch('model_limits') ?? []
  const allowIps = form.watch('allow_ips') ?? ''
  const allowQuotaQuery = form.watch('allow_user_quota_query')

  useEffect(() => {
    if (groups.length === 0) return
    const currentGroup = selectedGroup
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        groups[0]?.value ??
        ''
      form.setValue('group', fallback)
      if (currentGroup === 'auto') {
        form.setValue('auto_groups', [])
        form.setValue('auto_groups_mode', 'inherit')
        form.setValue('cross_group_retry', false)
      }
    }
  }, [groups, form, selectedGroup])

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const quickQuotas = tokensOnly
    ? [100_000, 500_000, 1_000_000, 5_000_000]
    : [5, 20, 50, 100]

  const ipCount = allowIps
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length

  const handleSetExpiry = (
    key: ExpiryKey,
    months: number,
    days: number,
    hours: number
  ) => {
    setActiveExpiry(key)
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', null, { shouldDirty: true })
      return
    }
    const next = new Date()
    next.setMonth(next.getMonth() + months)
    next.setDate(next.getDate() + days)
    next.setHours(next.getHours() + hours)
    form.setValue('expired_time', next, { shouldDirty: true })
  }

  const formatQuickQuota = (amount: number) => {
    if (tokensOnly) {
      return amount >= 1_000_000
        ? `${amount / 1_000_000}M`
        : `${amount / 1_000}K`
    }
    return `${formatNumber(amount, locale)} ${currencyLabel}`
  }

  const quotaSummaryText = unlimitedQuota
    ? t('Unlimited Quota')
    : `${formatNumber(remainQuota, locale)} ${currencyLabel}`

  const expirySummaryText = expiredTime
    ? expiredTime.toLocaleDateString(locale)
    : t('Never expires')

  const apiBaseUrl =
    (typeof status?.server_address === 'string' &&
      status.server_address.trim()) ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          handleServerError(result, t(ERROR_MESSAGES.UPDATE_FAILED))
        }
        return
      }

      const count = data.tokenCount || 1
      let successCount = 0

      for (let i = 0; i < count; i++) {
        const result = await createApiKey({
          ...basePayload,
          name:
            i === 0 && data.name
              ? data.name
              : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
        })
        if (result.success) {
          successCount++
        } else {
          handleServerError(result, t(ERROR_MESSAGES.CREATE_FAILED))
          break
        }
      }

      if (successCount > 0) {
        toast.success(
          t('Successfully created {{count}} API Key(s)', {
            count: successCount,
          })
        )
        triggerRefresh()
        setCreatedSummary({
          name: data.name || 'default',
          count: successCount,
          group: data.group || 'default',
          quotaLabel: data.unlimited_quota
            ? t('Unlimited Quota')
            : `${formatNumber(data.remain_quota_dollars || 0, locale)} ${currencyLabel}`,
          expiryLabel: data.expired_time
            ? data.expired_time.toLocaleDateString(locale)
            : t('Never expires'),
        })
      }
    } catch (error) {
      handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleCreateAnother = () => {
    setCreatedSummary(null)
    setActiveExpiry('never')
    setAdvancedOpen(false)
    form.reset({
      ...getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto),
      group: resolvedCreateGroup,
    })
  }

  const expiryOptions: Array<{
    key: ExpiryKey
    label: string
    months: number
    days: number
    hours: number
  }> = [
    { key: 'never', label: t('Never'), months: 0, days: 0, hours: 0 },
    { key: '1h', label: t('1 Hour'), months: 0, days: 0, hours: 1 },
    { key: '1d', label: t('1 Day'), months: 0, days: 1, hours: 0 },
    { key: '7d', label: t('7 Days'), months: 0, days: 7, hours: 0 },
    { key: '1m', label: t('1 Month'), months: 1, days: 0, hours: 0 },
    { key: '1y', label: t('1 Year'), months: 12, days: 0, hours: 0 },
  ]

  let dialogTitleText = t('Create API Key')
  let dialogDescText = t(
    'Generate a secret key to authenticate API requests from your apps.'
  )
  if (createdSummary) {
    dialogTitleText = t('API Key Ready')
    dialogDescText = t(
      'Copy your secret key and start calling the unified API immediately.'
    )
  } else if (isUpdate) {
    dialogTitleText = t('Update API Key')
    dialogDescText = t('Adjust routing group, quota cap, or access controls.')
  }

  const dialogFooter = createdSummary ? undefined : (
    <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
        <span className='text-foreground font-medium'>
          {selectedGroup || 'default'}
        </span>
        <span>·</span>
        <span>{quotaSummaryText}</span>
        <span>·</span>
        <span>{expirySummaryText}</span>
        {!isUpdate && tokenCount > 1 ? (
          <>
            <span>·</span>
            <Badge variant='secondary' className='h-4 px-1.5 font-mono text-[10px]'>
              ×{tokenCount}
            </Badge>
          </>
        ) : null}
      </div>
      <div className='flex flex-col-reverse gap-2 sm:flex-row'>
        <Button
          type='button'
          variant='outline'
          onClick={() => onOpenChange(false)}
        >
          {t('Close')}
        </Button>
        <Button
          type='button'
          onClick={form.handleSubmit(onSubmit, onInvalid)}
          disabled={!isFormInitialized || isSubmitting}
        >
          {isSubmitting ? t('Saving...') : t('Save changes')}
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName={
        createdSummary
          ? 'sm:max-w-[640px]'
          : 'sm:max-w-[820px] lg:max-w-[1040px]'
      }
      contentHeight='auto'
      bodyClassName='max-h-[76vh]'
      title={
        <span className='flex items-center gap-2'>
          <span className='bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg'>
            <KeyRound className='size-4' aria-hidden='true' />
          </span>
          <span>{dialogTitleText}</span>
        </span>
      }
      description={dialogDescText}
      footer={dialogFooter}
    >
      {createdSummary ? (
        <ApiKeyCreatedView
          summary={createdSummary}
          baseUrl={apiBaseUrl}
          onCreateAnother={handleCreateAnother}
          onDone={() => onOpenChange(false)}
        />
      ) : (
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            aria-busy={!isFormInitialized}
            inert={!isFormInitialized || isSubmitting ? true : undefined}
            className='grid gap-5 py-1 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,1fr)] lg:items-start'
          >
            {/* Left Column: Full-size Vendor & Channel/Group Explorer */}
            <div className='min-w-0 lg:sticky lg:top-0'>
              <FormField
                control={form.control}
                name='group'
                render={({ field }) => {
                  const handleGroupChange = (group: string) => {
                    field.onChange(group)
                    if (group === 'auto') {
                      form.setValue('cross_group_retry', true, {
                        shouldDirty: true,
                      })
                      return
                    }
                    form.setValue('cross_group_retry', false, {
                      shouldDirty: true,
                    })
                  }
                  return (
                    <FormItem>
                      <FormLabel>{t('Group')}</FormLabel>
                      <FormControl>
                        <ApiKeyVendorGroupPicker
                          groups={groups}
                          userModels={models}
                          selectedGroup={field.value}
                          onSelectGroup={handleGroupChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />
            </div>

            {/* Right Column: Key Identity, Auto Order, Quota, Expiry & Access Controls */}
            <div className='min-w-0 space-y-4'>
              {/* Row 1: Name + Quantity */}
              <div
                className={
                  isUpdate
                    ? 'space-y-2'
                    : 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_116px] sm:items-start'
                }
              >
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Name')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoFocus={!isUpdate}
                          placeholder={t(
                            'e.g. Production, Cursor, Personal App'
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isUpdate && (
                  <FormField
                    control={form.control}
                    name='tokenCount'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Quantity')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type='number'
                            min='1'
                            className='font-mono'
                            placeholder='1'
                            onChange={(e) =>
                              field.onChange(
                                Number.parseInt(e.target.value, 10) || 1
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {selectedGroup === 'auto' && (
                <div className='border-border/70 bg-muted/25 space-y-3 rounded-xl border p-3.5'>
                  <FormField
                    control={form.control}
                    name='auto_groups'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Auto group order')}</FormLabel>
                        <FormDescription className='text-xs'>
                          {t(
                            'Choose and order the groups this API key will try.'
                          )}
                        </FormDescription>
                        <FormControl>
                          <AutoGroupOrderEditor
                            value={field.value}
                            mode={autoGroupsMode}
                            options={groups}
                            globalOptions={globalAutoGroupOptions}
                            maxCount={maxAutoGroups}
                            onChange={(value) => {
                              form.setValue('auto_groups_mode', value.mode, {
                                shouldDirty: true,
                                shouldValidate: false,
                              })
                              form.setValue(
                                'auto_groups',
                                value.groups.slice(0, maxAutoGroups),
                                {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                }
                              )
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='cross_group_retry'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-center justify-between gap-3 pt-1'>
                        <div className='space-y-0.5'>
                          <FormLabel className='text-sm'>
                            {t('Cross-group retry')}
                          </FormLabel>
                          <FormDescription className='text-xs'>
                            {t(
                              'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                            )}
                            <RelatedPolicyLink section='routing' />
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

            {/* Row 3: Quota Limit (single clean row + inline cap input when limited) */}
            <div className='border-border/70 bg-card/50 space-y-3 rounded-xl border p-3.5'>
              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between gap-3 space-y-0'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm font-medium'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {field.value
                          ? t('Uses your account balance with no per-key cap.')
                          : t('Set a maximum spending limit for this key.')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          if (
                            !checked &&
                            (form.getValues('remain_quota_dollars') ?? 0) <= 0
                          ) {
                            form.setValue(
                              'remain_quota_dollars',
                              tokensOnly ? 500_000 : 10,
                              { shouldDirty: true, shouldValidate: true }
                            )
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem className='border-border/60 border-t pt-3'>
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                        <div className='relative flex-1'>
                          <FormLabel className='sr-only'>
                            {quotaLabel}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type='number'
                              min={0}
                              step={tokensOnly ? 1 : 0.01}
                              placeholder={quotaPlaceholder}
                              className='pr-16 font-mono'
                              onChange={(e) =>
                                field.onChange(
                                  Number.parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </FormControl>
                          <span className='text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs'>
                            {currencyLabel}
                          </span>
                        </div>
                        <div className='flex flex-wrap items-center gap-1'>
                          {quickQuotas.map((amount) => (
                            <Button
                              key={amount}
                              type='button'
                              size='sm'
                              variant={
                                remainQuota === amount ? 'default' : 'outline'
                              }
                              className='h-8 px-2 font-mono text-xs'
                              onClick={() =>
                                form.setValue('remain_quota_dollars', amount, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }
                            >
                              {formatQuickQuota(amount)}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Row 4: Expiration */}
            <FormField
              control={form.control}
              name='expired_time'
              render={({ field }) => (
                <FormItem className='border-border/70 bg-card/50 space-y-2.5 rounded-xl border p-3.5'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <FormLabel className='text-sm font-medium'>
                      {t('Expiration Time')}
                    </FormLabel>
                    <div className='flex flex-wrap gap-1'>
                      {expiryOptions.map((opt) => {
                        const selected =
                          (opt.key === 'never' && !field.value) ||
                          (opt.key !== 'never' &&
                            !!field.value &&
                            activeExpiry === opt.key)
                        return (
                          <Button
                            key={opt.key}
                            type='button'
                            size='sm'
                            variant={selected ? 'default' : 'ghost'}
                            className={cn(
                              'h-7 rounded-md px-2 text-xs',
                              !selected && 'text-muted-foreground'
                            )}
                            onClick={() =>
                              handleSetExpiry(
                                opt.key,
                                opt.months,
                                opt.days,
                                opt.hours
                              )
                            }
                          >
                            {opt.label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ?? undefined}
                      onChange={(date) => {
                        field.onChange(date ?? null)
                        setActiveExpiry(date ? 'custom' : 'never')
                      }}
                      placeholder={t('Never expires')}
                      className='w-full min-w-0 [&_input[type=time]]:w-28 sm:[&_input[type=time]]:w-32'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Row 5: Collapsible Access Restrictions */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className='border-border/70 bg-card/50 rounded-xl border'>
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/40 flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors'
                    />
                  }
                >
                  <div className='flex items-center gap-2'>
                    <SlidersHorizontal
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='text-sm font-medium'>
                      {t('Advanced Settings')}
                    </span>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    {modelLimits.length > 0 ? (
                      <Badge variant='secondary' className='text-[11px]'>
                        {t('{{count}} models', { count: modelLimits.length })}
                      </Badge>
                    ) : null}
                    {ipCount > 0 ? (
                      <Badge variant='secondary' className='text-[11px]'>
                        {t('{{count}} IPs', { count: ipCount })}
                      </Badge>
                    ) : null}
                    {!allowQuotaQuery ? (
                      <Badge variant='outline' className='text-[11px]'>
                        <Lock className='mr-1 size-3' aria-hidden='true' />
                        {t('Quota query off')}
                      </Badge>
                    ) : null}
                    <ChevronDown
                      className={cn(
                        'text-muted-foreground size-4 shrink-0 transition-transform',
                        advancedOpen && 'rotate-180'
                      )}
                    />
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className='border-border/60 space-y-4 border-t px-3.5 pt-3.5 pb-4'>
                    <FormField
                      control={form.control}
                      name='model_limits'
                      render={({ field }) => (
                        <FormItem>
                          <div className='flex items-center justify-between gap-2'>
                            <FormLabel className='flex items-center gap-1.5 text-xs font-medium'>
                              <Shield
                                className='text-muted-foreground size-3.5'
                                aria-hidden='true'
                              />
                              {t('Model Limits')}
                            </FormLabel>
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
                          <FormControl>
                            <MultiSelect
                              options={modelOptions}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t(
                                'Select models (empty for allow all)'
                              )}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='text-xs font-medium'>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='min-h-18 resize-none font-mono text-xs'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={2}
                            />
                          </FormControl>
                          <FormDescription className='text-xs'>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_user_quota_query'
                      render={({ field }) => (
                        <FormItem className='flex flex-row items-center justify-between gap-3 space-y-0'>
                          <div className='space-y-0.5'>
                            <FormLabel className='text-sm'>
                              {t('Allow querying user quota')}
                            </FormLabel>
                            <FormDescription className='text-xs'>
                              {t(
                                "When enabled, this API key can be used to check your account's remaining and used quota."
                              )}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            </div>
          </form>
        </Form>
      )}
    </Dialog>
  )
}
