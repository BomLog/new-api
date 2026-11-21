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
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getPricing } from '@/features/pricing/api'
import { useMediaQuery } from '@/hooks'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  buildGroupModelsDirectory,
  buildVendorGroupDirectory,
  formatContextLengthBadge,
  inferVendorPreset,
  type VendorGroupEntry,
} from '../lib/model-vendor-icons'
import type { ApiKeyGroupOption } from './api-key-group-combobox'
import {
  AUTO_GROUP_FRAME_CLASS_NAME,
  AutoGroupFlowBorder,
  GroupRatioBadge,
} from './auto-group-visuals'

type ApiKeyVendorGroupPickerProps = {
  groups: ApiKeyGroupOption[]
  userModels: string[]
  selectedGroup?: string
  onSelectGroup: (group: string) => void
  disabled?: boolean
}

const OTHER_VENDOR_TAB_ID = '__other_groups__'
const CARD_MODEL_PREVIEW_LIMIT = 6

function renderModelOrVendorIcon(
  iconKey: string | null | undefined,
  size = 16
) {
  const icon = iconKey ? getLobeIcon(iconKey, size) : null
  if (icon) {
    return (
      <span
        aria-hidden='true'
        className='flex shrink-0 items-center justify-center'
      >
        {icon}
      </span>
    )
  }
  return (
    <Cpu
      aria-hidden='true'
      className='text-muted-foreground shrink-0'
      style={{ width: size, height: size }}
    />
  )
}

function findLowestRatioGroupValue(
  items: VendorGroupEntry['groups']
): string | null {
  let bestValue: string | null = null
  let bestRatio = Number.POSITIVE_INFINITY
  for (const item of items) {
    if (
      typeof item.option.ratio === 'number' &&
      Number.isFinite(item.option.ratio) &&
      item.option.ratio < bestRatio
    ) {
      bestRatio = item.option.ratio
      bestValue = item.option.value
    }
  }
  return bestValue
}

/**
 * Full-size embedded left-pane vendor & channel selector for the API key modal:
 * - Always visible without an extra dropdown click.
 * - Left column lists model vendors (with icons) + Auto smart routing.
 * - Clicking a vendor only filters the right column without changing the current selection.
 * - Right column displays channels/groups sorted by lowest ratio, marks the lowest-ratio
 *   channel as Recommended, and lets users expand all vendor models inline.
 * - Bottom bar provides an expandable full "Available Models" explorer for the active group.
 */
export function ApiKeyVendorGroupPicker(props: ApiKeyVendorGroupPickerProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [browsingVendorId, setBrowsingVendorId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(
    {}
  )
  const [modelsDrawerOpen, setModelsDrawerOpen] = useState(false)
  const [modelsDrawerVendor, setModelsDrawerVendor] = useState<string>('all')
  const [modelsDrawerSearch, setModelsDrawerSearch] = useState('')

  const { data: pricingData, isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 30 * 1000,
    retry: false,
    meta: { errorToast: false },
    enabled: props.groups.length > 0,
  })

  const autoOption = useMemo(
    () => props.groups.find((g) => g.value === 'auto'),
    [props.groups]
  )
  const standardGroups = useMemo(
    () => props.groups.filter((g) => g.value !== 'auto'),
    [props.groups]
  )

  const vendorEntries = useMemo(
    () =>
      buildVendorGroupDirectory({
        groups: props.groups,
        pricingModels: pricingData?.data,
        pricingVendors: pricingData?.vendors,
        userModels: props.userModels,
      }),
    [props.groups, pricingData, props.userModels]
  )

  const groupModelsDirectory = useMemo(
    () =>
      buildGroupModelsDirectory({
        groups: props.groups,
        pricingModels: pricingData?.data,
        pricingVendors: pricingData?.vendors,
        userModels: props.userModels,
      }),
    [props.groups, pricingData, props.userModels]
  )

  const otherGroupsEntry = useMemo<VendorGroupEntry | null>(() => {
    const covered = new Set<string>()
    for (const vendor of vendorEntries) {
      for (const group of vendor.groups) {
        covered.add(group.option.value)
      }
    }
    const unmatched = standardGroups.filter((g) => !covered.has(g.value))
    if (unmatched.length === 0) return null
    return {
      id: OTHER_VENDOR_TAB_ID,
      name: vendorEntries.length > 0 ? t('Other groups') : t('All groups'),
      iconKey: null,
      totalModels: 0,
      groups: unmatched.map((option) => ({ option, models: [] })),
    }
  }, [vendorEntries, standardGroups, t])

  const allVendorTabs = useMemo(() => {
    if (!otherGroupsEntry) return vendorEntries
    return [...vendorEntries, otherGroupsEntry]
  }, [vendorEntries, otherGroupsEntry])

  const selectedOption = props.groups.find(
    (g) => g.value === props.selectedGroup
  )
  const isAutoSelected = selectedOption?.value === 'auto'

  const selectedVendorOwner = useMemo(() => {
    if (!selectedOption || isAutoSelected) return null
    return (
      allVendorTabs.find((v) =>
        v.groups.some((g) => g.option.value === selectedOption.value)
      ) ?? null
    )
  }, [allVendorTabs, selectedOption, isAutoSelected])

  const selectedIconKey = useMemo(() => {
    if (!selectedOption || isAutoSelected) return null
    if (selectedVendorOwner?.iconKey) return selectedVendorOwner.iconKey
    return (
      inferVendorPreset(`${selectedOption.label} ${selectedOption.desc ?? ''}`)
        ?.iconKey ?? null
    )
  }, [selectedOption, isAutoSelected, selectedVendorOwner])

  const activeVendorId = useMemo(() => {
    if (
      browsingVendorId &&
      allVendorTabs.some((vendor) => vendor.id === browsingVendorId)
    ) {
      return browsingVendorId
    }
    if (selectedVendorOwner) return selectedVendorOwner.id
    return allVendorTabs[0]?.id ?? null
  }, [browsingVendorId, allVendorTabs, selectedVendorOwner])

  const activeVendor = useMemo(
    () => allVendorTabs.find((v) => v.id === activeVendorId) ?? null,
    [allVendorTabs, activeVendorId]
  )

  const recommendedGroupValue = useMemo(
    () =>
      activeVendor ? findLowestRatioGroupValue(activeVendor.groups) : null,
    [activeVendor]
  )

  const selectedGroupModelsSummary = useMemo(() => {
    if (selectedOption) {
      return groupModelsDirectory.get(selectedOption.value) ?? null
    }
    return groupModelsDirectory.get('default') ?? null
  }, [selectedOption, groupModelsDirectory])

  const drawerFilteredModels = useMemo(() => {
    if (!selectedGroupModelsSummary) return []
    const q = modelsDrawerSearch.trim().toLowerCase()
    const vendorFilterValid =
      modelsDrawerVendor === 'all' ||
      selectedGroupModelsSummary.vendors.some(
        (v) => v.id === modelsDrawerVendor
      )
    const activeDrawerVendor = vendorFilterValid ? modelsDrawerVendor : 'all'

    return selectedGroupModelsSummary.models.filter((item) => {
      if (
        activeDrawerVendor !== 'all' &&
        item.vendorId !== activeDrawerVendor
      ) {
        return false
      }
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.vendorName.toLowerCase().includes(q)
      )
    })
  }, [selectedGroupModelsSummary, modelsDrawerVendor, modelsDrawerSearch])

  const trimmedSearch = search.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!trimmedSearch) return []
    const matched: Array<{
      vendorName: string
      vendorIconKey: string | null
      option: ApiKeyGroupOption
      models: Array<{ name: string; iconKey: string | null }>
    }> = []
    const seen = new Set<string>()

    for (const vendor of allVendorTabs) {
      const vendorHit = vendor.name.toLowerCase().includes(trimmedSearch)
      for (const item of vendor.groups) {
        const hit =
          vendorHit ||
          item.option.label.toLowerCase().includes(trimmedSearch) ||
          item.option.desc?.toLowerCase().includes(trimmedSearch) ||
          item.models.some((m) => m.name.toLowerCase().includes(trimmedSearch))
        if (!hit) continue
        const dedupeKey = `${vendor.id}:${item.option.value}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        matched.push({
          vendorName: vendor.name,
          vendorIconKey: vendor.iconKey,
          option: item.option,
          models: item.models,
        })
      }
    }
    return matched
  }, [allVendorTabs, trimmedSearch])

  const autoMatchesSearch = useMemo(() => {
    if (!trimmedSearch || !autoOption) return false
    return (
      autoOption.label.toLowerCase().includes(trimmedSearch) ||
      (autoOption.desc?.toLowerCase().includes(trimmedSearch) ?? false) ||
      t('Smart Routing').toLowerCase().includes(trimmedSearch)
    )
  }, [trimmedSearch, autoOption, t])

  const handleSelectGroup = (groupValue: string) => {
    props.onSelectGroup(groupValue)
    setModelsDrawerVendor('all')
    setModelsDrawerSearch('')
  }

  const toggleCardExpanded = (cardKey: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }))
  }

  let activeHeaderIcon: ReactNode = (
    <Layers className='size-3.5' aria-hidden='true' />
  )
  if (isAutoSelected) {
    activeHeaderIcon = (
      <Sparkles className='text-primary size-3.5' aria-hidden='true' />
    )
  } else if (selectedIconKey) {
    activeHeaderIcon = renderModelOrVendorIcon(selectedIconKey, 15)
  }

  const activeHeaderLabel = selectedOption
    ? selectedOption.label
    : t('Follow user group')

  const showVendorSidebar = allVendorTabs.length > 0 && vendorEntries.length > 0

  const activeDrawerVendor =
    modelsDrawerVendor === 'all' ||
    selectedGroupModelsSummary?.vendors.some((v) => v.id === modelsDrawerVendor)
      ? modelsDrawerVendor
      : 'all'

  let rightPanelBody: ReactNode = (
    <p className='text-muted-foreground py-12 text-center text-xs'>
      {t('No group found.')}
    </p>
  )
  if (activeVendor) {
    rightPanelBody = (
      <>
        <div className='border-border/60 bg-muted/15 flex items-center justify-between gap-2 border-b px-3.5 py-2'>
          <span className='flex min-w-0 items-center gap-2 text-xs font-semibold'>
            {activeVendor.id === OTHER_VENDOR_TAB_ID ? (
              <Layers
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            ) : (
              renderModelOrVendorIcon(activeVendor.iconKey, 16)
            )}
            <span className='truncate'>{activeVendor.name}</span>
          </span>
          <span className='text-muted-foreground shrink-0 text-[11px]'>
            {t('{{count}} channels / groups', {
              count: activeVendor.groups.length,
            })}
          </span>
        </div>

        <div className='min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5'>
          {activeVendor.groups.map(({ option, models }) => {
            const isSelected = props.selectedGroup === option.value
            const isRecommended = recommendedGroupValue === option.value
            const cardKey = `${activeVendor.id}:${option.value}`
            const isExpanded = Boolean(expandedCards[cardKey])
            const visibleModels = isExpanded
              ? models
              : models.slice(0, CARD_MODEL_PREVIEW_LIMIT)
            const hiddenCount = Math.max(
              0,
              models.length - CARD_MODEL_PREVIEW_LIMIT
            )
            const showDesc =
              Boolean(option.desc) &&
              option.desc?.trim() !== option.label.trim()
            const groupTotalSummary = groupModelsDirectory.get(option.value)
            const extraVendorsCount = groupTotalSummary
              ? Math.max(0, groupTotalSummary.vendors.length - 1)
              : 0

            return (
              <div
                key={option.value}
                className={cn(
                  'rounded-xl border transition-all',
                  isSelected
                    ? 'border-primary bg-primary/8 shadow-2xs ring-1 ring-primary/25'
                    : 'border-border/65 bg-background/80 hover:border-primary/45 hover:bg-accent/35'
                )}
              >
                <button
                  type='button'
                  disabled={props.disabled}
                  aria-pressed={isSelected}
                  data-slot='vendor-channel-option'
                  data-group-value={option.value}
                  onClick={() => handleSelectGroup(option.value)}
                  className='flex w-full items-start gap-2.5 p-3 pb-2 text-left'
                >
                  <span
                    aria-hidden='true'
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/35'
                    )}
                  >
                    {isSelected ? (
                      <Check className='size-2.5 stroke-[3]' />
                    ) : null}
                  </span>

                  <span className='min-w-0 flex-1 space-y-1'>
                    <span className='flex items-center justify-between gap-2'>
                      <span className='flex min-w-0 items-center gap-1.5'>
                        <span className='truncate text-sm font-medium'>
                          {option.label}
                        </span>
                        {isRecommended ? (
                          <Badge
                            variant='secondary'
                            data-slot='recommended-channel-badge'
                            className='h-4 shrink-0 rounded border border-emerald-500/30 bg-emerald-500/12 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300'
                          >
                            {t('Recommended')}
                          </Badge>
                        ) : null}
                      </span>
                      <GroupRatioBadge ratio={option.ratio} />
                    </span>

                    {showDesc ? (
                      <span className='text-muted-foreground block truncate text-xs'>
                        {option.desc}
                      </span>
                    ) : null}

                    {models.length > 0 ||
                    (groupTotalSummary && groupTotalSummary.totalModels > 0) ? (
                      <span className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-[11px]'>
                        {models.length > 0 ? (
                          <span>
                            {t('{{count}} models', { count: models.length })}
                          </span>
                        ) : null}
                        {groupTotalSummary &&
                        groupTotalSummary.totalModels > models.length ? (
                          <>
                            <span>·</span>
                            <span className='inline-flex items-center gap-1'>
                              <span>
                                {t('All models')}:{' '}
                                {groupTotalSummary.totalModels}
                              </span>
                              {extraVendorsCount > 0 ? (
                                <span className='inline-flex items-center gap-0.5'>
                                  {groupTotalSummary.vendors
                                    .slice(0, 4)
                                    .map((vendorMeta) => (
                                      <span
                                        key={vendorMeta.id}
                                        title={`${vendorMeta.name} (${vendorMeta.count})`}
                                      >
                                        {renderModelOrVendorIcon(
                                          vendorMeta.iconKey,
                                          11
                                        )}
                                      </span>
                                    ))}
                                </span>
                              ) : null}
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </button>

                {visibleModels.length > 0 ? (
                  <div className='flex flex-wrap items-center gap-1 px-3 pt-0.5 pb-2.5 pl-9'>
                    {visibleModels.map((model) => (
                      <Badge
                        key={model.name}
                        variant='secondary'
                        className='h-5 gap-1 rounded px-1.5 font-mono text-[10px] font-normal'
                      >
                        {renderModelOrVendorIcon(model.iconKey, 12)}
                        <span className='max-w-36 truncate'>{model.name}</span>
                      </Badge>
                    ))}
                    {hiddenCount > 0 ? (
                      <button
                        type='button'
                        data-slot='expand-channel-models'
                        onClick={() => toggleCardExpanded(cardKey)}
                        className='text-primary hover:bg-primary/10 inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium transition-colors'
                      >
                        {isExpanded ? (
                          <>
                            <span>{t('Collapse')}</span>
                            <ChevronUp className='size-3' aria-hidden='true' />
                          </>
                        ) : (
                          <>
                            <span>
                              +{hiddenCount} {t('Expand')}
                            </span>
                            <ChevronDown
                              className='size-3'
                              aria-hidden='true'
                            />
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </>
    )
  } else if (isLoading) {
    rightPanelBody = (
      <div className='text-muted-foreground flex flex-1 items-center justify-center gap-2 py-12 text-xs'>
        <Loader2 className='size-4 animate-spin' aria-hidden='true' />
        {t('Loading model vendors...')}
      </div>
    )
  }

  let mainBody: ReactNode
  if (modelsDrawerOpen) {
    mainBody = (
      <div
        data-slot='group-all-models-view'
        className='flex max-h-96 min-h-0 flex-1 flex-col lg:max-h-none'
      >
        <div className='border-border/60 bg-muted/15 space-y-2 border-b px-3 py-2.5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex min-w-0 items-center gap-1.5 text-xs font-semibold'>
              {activeHeaderIcon}
              <span className='truncate'>{activeHeaderLabel}</span>
              <span className='text-muted-foreground font-normal'>·</span>
              <span className='text-muted-foreground font-normal'>
                {t('Available Models')} (
                {selectedGroupModelsSummary?.totalModels ?? 0})
              </span>
            </div>

            <div className='border-border/70 bg-background/85 flex w-full items-center gap-1.5 rounded-lg border px-2.5 sm:w-44'>
              <Search
                aria-hidden='true'
                className='text-muted-foreground size-3.5 shrink-0'
              />
              <Input
                value={modelsDrawerSearch}
                onChange={(e) => setModelsDrawerSearch(e.target.value)}
                placeholder={t('Search models...')}
                className='h-6 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0'
              />
              {modelsDrawerSearch ? (
                <button
                  type='button'
                  onClick={() => setModelsDrawerSearch('')}
                  aria-label={t('Clear')}
                  className='text-muted-foreground hover:text-foreground rounded p-0.5'
                >
                  <X className='size-3' aria-hidden='true' />
                </button>
              ) : null}
            </div>
          </div>

          {selectedGroupModelsSummary &&
          selectedGroupModelsSummary.vendors.length > 1 ? (
            <div className='flex flex-wrap items-center gap-1'>
              <button
                type='button'
                onClick={() => setModelsDrawerVendor('all')}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
                  activeDrawerVendor === 'all'
                    ? 'border-primary/60 bg-primary/12 text-foreground font-medium'
                    : 'border-border/65 bg-background/70 text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{t('All models')}</span>
                <span className='font-mono text-[10px]'>
                  {selectedGroupModelsSummary.totalModels}
                </span>
              </button>
              {selectedGroupModelsSummary.vendors.map((vendorMeta) => (
                <button
                  key={vendorMeta.id}
                  type='button'
                  onClick={() => setModelsDrawerVendor(vendorMeta.id)}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
                    activeDrawerVendor === vendorMeta.id
                      ? 'border-primary/60 bg-primary/12 text-foreground font-medium'
                      : 'border-border/65 bg-background/70 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {renderModelOrVendorIcon(vendorMeta.iconKey, 12)}
                  <span>{vendorMeta.name}</span>
                  <span className='font-mono text-[10px]'>
                    {vendorMeta.count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
          {drawerFilteredModels.length === 0 ? (
            <p className='text-muted-foreground py-12 text-center text-xs'>
              {selectedGroupModelsSummary?.totalModels
                ? t('No models found')
                : t('No models available')}
            </p>
          ) : (
            <div className='grid gap-1.5 sm:grid-cols-2'>
              {drawerFilteredModels.map((model) => {
                const ctxBadge = formatContextLengthBadge(model.contextLength)
                let billingLabel: string | null = null
                if (model.quotaType === 0) {
                  billingLabel = t('Token-based')
                } else if (model.quotaType === 1) {
                  billingLabel = t('Per Request')
                }

                return (
                  <div
                    key={model.name}
                    data-slot='group-model-item'
                    className='border-border/60 bg-background/80 hover:border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors'
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      {renderModelOrVendorIcon(model.iconKey, 15)}
                      <div className='min-w-0'>
                        <div
                          className='truncate font-mono text-xs font-medium'
                          title={model.name}
                        >
                          {model.name}
                        </div>
                        {billingLabel || ctxBadge ? (
                          <div className='text-muted-foreground flex items-center gap-1.5 text-[10px]'>
                            {billingLabel ? <span>{billingLabel}</span> : null}
                            {ctxBadge ? (
                              <span className='font-mono'>{ctxBadge}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <CopyButton
                      value={model.name}
                      size='icon'
                      variant='ghost'
                      className='text-muted-foreground hover:text-foreground size-6'
                      iconClassName='size-3'
                      aria-label={model.name}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  } else if (trimmedSearch) {
    mainBody = (
      <div className='max-h-80 min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 lg:max-h-none'>
        {autoMatchesSearch && autoOption ? (
          <button
            type='button'
            disabled={props.disabled}
            onClick={() => handleSelectGroup(autoOption.value)}
            className={cn(
              'flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
              isAutoSelected
                ? 'border-primary/65 bg-primary/10'
                : 'border-border/65 bg-background/80 hover:border-primary/45 hover:bg-accent/50'
            )}
          >
            <span className='flex min-w-0 items-center gap-2'>
              <Sparkles
                className='text-primary size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>
                  {autoOption.label}
                </span>
                {autoOption.desc ? (
                  <span className='text-muted-foreground block truncate text-xs'>
                    {autoOption.desc}
                  </span>
                ) : null}
              </span>
            </span>
            <GroupRatioBadge
              ratio={autoOption.ratio}
              isAuto
              shouldReduceMotion={shouldReduceMotion}
            />
          </button>
        ) : null}

        {searchResults.map(({ vendorName, vendorIconKey, option, models }) => {
          const isSelected = props.selectedGroup === option.value
          return (
            <button
              key={`${vendorName}-${option.value}`}
              type='button'
              disabled={props.disabled}
              onClick={() => handleSelectGroup(option.value)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                isSelected
                  ? 'border-primary/65 bg-primary/10'
                  : 'border-border/65 bg-background/80 hover:border-primary/45 hover:bg-accent/50'
              )}
            >
              <span
                aria-hidden='true'
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/35'
                )}
              >
                {isSelected ? <Check className='size-2.5 stroke-[3]' /> : null}
              </span>
              <span className='min-w-0 flex-1 space-y-1.5'>
                <span className='flex items-center justify-between gap-2'>
                  <span className='flex min-w-0 items-center gap-1.5'>
                    {renderModelOrVendorIcon(vendorIconKey, 15)}
                    <span className='truncate text-sm font-medium'>
                      {option.label}
                    </span>
                    <Badge
                      variant='secondary'
                      className='h-4 rounded px-1.5 text-[10px] font-normal'
                    >
                      {vendorName}
                    </Badge>
                  </span>
                  <GroupRatioBadge ratio={option.ratio} />
                </span>
                {models.length > 0 ? (
                  <span className='flex flex-wrap gap-1'>
                    {models.slice(0, CARD_MODEL_PREVIEW_LIMIT).map((model) => (
                      <Badge
                        key={model.name}
                        variant='secondary'
                        className='h-5 gap-1 rounded px-1.5 font-mono text-[10px] font-normal'
                      >
                        {renderModelOrVendorIcon(model.iconKey, 12)}
                        <span className='max-w-36 truncate'>{model.name}</span>
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}

        {!autoMatchesSearch && searchResults.length === 0 ? (
          <p className='text-muted-foreground py-12 text-center text-xs'>
            {t('No group found.')}
          </p>
        ) : null}
      </div>
    )
  } else {
    mainBody = (
      <div className='flex min-h-0 flex-1 flex-col sm:flex-row'>
        {showVendorSidebar ? (
          <div className='border-border/65 bg-muted/20 flex shrink-0 flex-col border-b sm:w-44 sm:border-r sm:border-b-0'>
            {autoOption ? (
              <div className='border-border/60 border-b p-2'>
                <button
                  type='button'
                  disabled={props.disabled}
                  onClick={() => handleSelectGroup(autoOption.value)}
                  data-slot='auto-routing-option'
                  data-auto-group-effect={
                    isAutoSelected ? 'trigger' : undefined
                  }
                  className={cn(
                    'relative flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-all',
                    isAutoSelected
                      ? cn(
                          AUTO_GROUP_FRAME_CLASS_NAME,
                          'bg-primary/12 text-foreground font-medium'
                        )
                      : 'border-transparent text-foreground/85 hover:bg-accent/60'
                  )}
                >
                  {isAutoSelected && (
                    <AutoGroupFlowBorder
                      shouldReduceMotion={shouldReduceMotion}
                    />
                  )}
                  <span className='flex min-w-0 items-center gap-2'>
                    <Sparkles
                      className='text-primary size-3.5 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='truncate'>{autoOption.label}</span>
                  </span>
                  <Badge
                    variant='secondary'
                    className='h-4 shrink-0 rounded px-1 text-[10px] font-normal'
                  >
                    {t('Auto')}
                  </Badge>
                </button>
              </div>
            ) : null}

            <div
              role='tablist'
              aria-label={t('Select model vendor')}
              className='flex min-h-0 flex-1 gap-1 overflow-x-auto p-2 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto'
            >
              {allVendorTabs.map((vendor) => {
                const isActive = activeVendor?.id === vendor.id
                const hasSelected = vendor.groups.some(
                  (g) => g.option.value === props.selectedGroup
                )
                const isOther = vendor.id === OTHER_VENDOR_TAB_ID

                return (
                  <button
                    key={vendor.id}
                    type='button'
                    role='tab'
                    aria-selected={isActive}
                    disabled={props.disabled}
                    data-slot='vendor-group-button'
                    data-vendor-id={vendor.id}
                    onClick={() => setBrowsingVendorId(vendor.id)}
                    className={cn(
                      'flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors sm:w-full',
                      isActive
                        ? 'bg-background text-foreground font-medium shadow-2xs ring-1 ring-border/80'
                        : 'text-foreground/75 hover:bg-accent/55 hover:text-foreground'
                    )}
                  >
                    <span className='flex min-w-0 items-center gap-2'>
                      {isOther ? (
                        <Layers
                          className='text-muted-foreground size-3.5 shrink-0'
                          aria-hidden='true'
                        />
                      ) : (
                        renderModelOrVendorIcon(vendor.iconKey, 16)
                      )}
                      <span className='max-w-24 truncate'>{vendor.name}</span>
                    </span>
                    <span className='flex shrink-0 items-center gap-1'>
                      {hasSelected ? (
                        <span
                          aria-hidden='true'
                          className='bg-primary size-1.5 rounded-full'
                        />
                      ) : null}
                      <span className='text-muted-foreground font-mono text-[10px] tabular-nums'>
                        {vendor.groups.length}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div
          role='tabpanel'
          data-slot='vendor-channels-panel'
          className='flex max-h-80 min-h-0 min-w-0 flex-1 flex-col lg:max-h-none'
        >
          {!showVendorSidebar && autoOption ? (
            <div className='border-border/60 border-b p-2.5'>
              <button
                type='button'
                disabled={props.disabled}
                onClick={() => handleSelectGroup(autoOption.value)}
                data-slot='auto-routing-option'
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                  isAutoSelected
                    ? 'border-primary/65 bg-primary/10 font-medium'
                    : 'border-border/65 hover:border-primary/45 hover:bg-accent/50'
                )}
              >
                <span className='flex items-center gap-2'>
                  <Sparkles
                    className='text-primary size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='font-medium'>{autoOption.label}</span>
                  {autoOption.desc ? (
                    <span className='text-muted-foreground truncate'>
                      {autoOption.desc}
                    </span>
                  ) : null}
                </span>
                <GroupRatioBadge
                  ratio={autoOption.ratio}
                  isAuto
                  shouldReduceMotion={shouldReduceMotion}
                />
              </button>
            </div>
          ) : null}

          {rightPanelBody}
        </div>
      </div>
    )
  }

  return (
    <div
      data-slot='vendor-group-panel'
      className='border-border/75 bg-card/55 flex flex-col overflow-hidden rounded-xl border lg:h-[510px]'
    >
      {/* Header: active selection pill + search */}
      <div className='border-border/65 bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('Selected group')}:
          </span>
          <span
            data-slot='selected-group-summary'
            className={cn(
              'border-border/75 bg-background/90 relative inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-1.5 pl-2 text-xs shadow-2xs',
              isAutoSelected && AUTO_GROUP_FRAME_CLASS_NAME
            )}
          >
            {isAutoSelected && (
              <AutoGroupFlowBorder shouldReduceMotion={shouldReduceMotion} />
            )}
            {activeHeaderIcon}
            <span
              data-slot='selected-group-label'
              className='max-w-36 truncate font-semibold'
            >
              {activeHeaderLabel}
            </span>
            {selectedOption ? (
              <GroupRatioBadge
                ratio={selectedOption.ratio}
                isAuto={isAutoSelected}
                shouldReduceMotion={shouldReduceMotion}
              />
            ) : (
              <Badge
                variant='secondary'
                className='h-4 rounded px-1.5 text-[10px] font-normal'
              >
                {t('Inherited')}
              </Badge>
            )}
          </span>
        </div>

        {!modelsDrawerOpen ? (
          <div className='border-border/70 bg-background/85 flex w-full items-center gap-1.5 rounded-lg border px-2.5 sm:w-48'>
            <Search
              aria-hidden='true'
              className='text-muted-foreground size-3.5 shrink-0'
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search groups or models...')}
              className='h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0'
            />
            {search ? (
              <button
                type='button'
                onClick={() => setSearch('')}
                aria-label={t('Clear')}
                className='text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors'
              >
                <X className='size-3.5' aria-hidden='true' />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Main body */}
      {mainBody}

      {/* Footer bar: full available models overview & toggle for the selected group */}
      <div
        data-slot='group-models-footer'
        className='border-border/65 bg-muted/25 flex items-center justify-between gap-2 border-t px-3.5 py-2'
      >
        <div className='flex min-w-0 items-center gap-2'>
          <span className='text-xs font-medium'>{t('Available Models')}</span>
          <Badge
            variant='secondary'
            className='h-5 rounded px-1.5 font-mono text-[10px]'
          >
            {t('{{count}} models', {
              count: selectedGroupModelsSummary?.totalModels ?? 0,
            })}
          </Badge>
          {selectedGroupModelsSummary &&
          selectedGroupModelsSummary.vendors.length > 0 ? (
            <span className='hidden items-center gap-1 sm:inline-flex'>
              {selectedGroupModelsSummary.vendors.slice(0, 6).map((vendor) => (
                <span
                  key={vendor.id}
                  title={`${vendor.name} (${vendor.count})`}
                  className='border-border/60 bg-background/80 flex size-5 items-center justify-center rounded-md border'
                >
                  {renderModelOrVendorIcon(vendor.iconKey, 12)}
                </span>
              ))}
              {selectedGroupModelsSummary.vendors.length > 6 ? (
                <span className='text-muted-foreground font-mono text-[10px]'>
                  +{selectedGroupModelsSummary.vendors.length - 6}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <button
          type='button'
          data-slot='toggle-group-models-drawer'
          aria-expanded={modelsDrawerOpen}
          onClick={() => setModelsDrawerOpen((prev) => !prev)}
          className='text-primary hover:bg-primary/10 inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors'
        >
          <span>{modelsDrawerOpen ? t('Collapse') : t('Expand')}</span>
          {modelsDrawerOpen ? (
            <ChevronDown className='size-3.5' aria-hidden='true' />
          ) : (
            <ChevronUp className='size-3.5' aria-hidden='true' />
          )}
        </button>
      </div>
    </div>
  )
}
