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
  ArrowUpDown,
  Check,
  ChevronsUpDown,
  Layers,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { inferVendorPreset } from '../lib/model-vendor-icons'
import {
  AUTO_GROUP_FRAME_CLASS_NAME,
  AutoGroupFlowBorder,
  GroupRatioBadge,
} from './auto-group-visuals'

export type ApiKeyGroupOption = {
  value: string
  label: string
  desc?: string
  ratio?: number | string
}

type ApiKeyGroupComboboxProps = {
  options: ApiKeyGroupOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  showQuickChips?: boolean
}

function getNumericRatio(ratio: number | string | undefined): number {
  return typeof ratio === 'number' && Number.isFinite(ratio)
    ? ratio
    : Number.POSITIVE_INFINITY
}

function renderGroupLeadingIcon(
  option: ApiKeyGroupOption | undefined,
  isAuto: boolean,
  size = 14
) {
  if (isAuto) {
    return <Sparkles className='size-3.5' aria-hidden='true' />
  }
  const preset = option
    ? inferVendorPreset(`${option.label} ${option.desc ?? ''}`)
    : null
  const icon = preset ? getLobeIcon(preset.iconKey, size) : null
  if (icon) return icon
  return <Layers className='size-3.5' aria-hidden='true' />
}

export function ApiKeyGroupCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  showQuickChips = false,
}: ApiKeyGroupComboboxProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [sortByRatio, setSortByRatio] = useState(false)
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const selectedOption = options.find((option) => option.value === value)
  const isAutoSelected = selectedOption?.value === 'auto'

  const { autoOptions, standardOptions, canSortByRatio } = useMemo(() => {
    const search = searchValue.trim().toLowerCase()
    const matched = search
      ? options.filter((option) => {
          const ratioText = String(option.ratio ?? '').toLowerCase()
          return (
            option.value.toLowerCase().includes(search) ||
            option.label.toLowerCase().includes(search) ||
            option.desc?.toLowerCase().includes(search) ||
            ratioText.includes(search)
          )
        })
      : options

    const autoList = matched.filter((option) => option.value === 'auto')
    const regularList = matched.filter((option) => option.value !== 'auto')
    const numericCount = options.filter(
      (option) =>
        option.value !== 'auto' &&
        typeof option.ratio === 'number' &&
        Number.isFinite(option.ratio)
    ).length

    const sortedRegular = sortByRatio
      ? [...regularList].sort(
          (a, b) => getNumericRatio(a.ratio) - getNumericRatio(b.ratio)
        )
      : regularList

    return {
      autoOptions: autoList,
      standardOptions: sortedRegular,
      canSortByRatio: numericCount >= 2,
    }
  }, [options, searchValue, sortByRatio])

  const quickChipOptions = useMemo(() => {
    if (!showQuickChips || options.length < 2) return []
    return options.slice(0, 5)
  }, [showQuickChips, options])

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
    setSearchValue('')
  }

  const renderGroupOption = (option: ApiKeyGroupOption) => {
    const isAutoOption = option.value === 'auto'
    const isSelected = value === option.value

    return (
      <CommandItem
        key={option.value}
        value={option.value}
        data-auto-group-effect={isAutoOption ? 'option' : undefined}
        onSelect={() => handleSelect(option.value)}
        className={cn(
          'data-[selected=true]:bg-accent/70 items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors',
          isSelected && !isAutoOption && 'bg-accent/45',
          isAutoOption &&
            cn(
              AUTO_GROUP_FRAME_CLASS_NAME,
              'border-primary/35 data-[selected=true]:border-primary/55'
            )
        )}
      >
        {isAutoOption && (
          <AutoGroupFlowBorder shouldReduceMotion={shouldReduceMotion} />
        )}
        <span
          aria-hidden='true'
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
            isSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/35 bg-transparent'
          )}
        >
          {isSelected ? <Check className='size-2.5 stroke-[3]' /> : null}
        </span>

        <span
          aria-hidden='true'
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md border',
            isAutoOption
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border/70 bg-muted/50 text-muted-foreground'
          )}
        >
          {renderGroupLeadingIcon(option, isAutoOption, 15)}
        </span>

        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-1.5'>
            <span className='truncate text-sm font-medium'>{option.label}</span>
            {isAutoOption ? (
              <Badge
                variant='secondary'
                className='h-4 rounded px-1.5 text-[10px] font-medium'
              >
                {t('Recommended')}
              </Badge>
            ) : null}
          </span>
          {option.desc && (
            <span className='text-muted-foreground block truncate text-xs'>
              {option.desc}
            </span>
          )}
        </span>

        <GroupRatioBadge
          ratio={option.ratio}
          isAuto={isAutoOption}
          shouldReduceMotion={shouldReduceMotion}
        />
      </CommandItem>
    )
  }

  return (
    <div className='space-y-2'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type='button'
              variant='outline'
              role='combobox'
              aria-expanded={open}
              data-auto-group-effect={isAutoSelected ? 'trigger' : undefined}
              disabled={disabled}
              className={cn(
                'border-input bg-background/70 hover:bg-accent/40 hover:text-foreground data-popup-open:border-ring data-popup-open:bg-background data-popup-open:ring-ring/20 relative h-auto min-h-12 w-full justify-between gap-2.5 rounded-xl px-3 py-2 text-start shadow-none transition-[background-color,border-color,box-shadow] duration-150 data-popup-open:ring-[3px]',
                isAutoSelected &&
                  cn(
                    AUTO_GROUP_FRAME_CLASS_NAME,
                    'hover:border-primary/55 data-popup-open:border-primary/55 data-popup-open:ring-primary/20'
                  )
              )}
            />
          }
        >
          {isAutoSelected && (
            <AutoGroupFlowBorder shouldReduceMotion={shouldReduceMotion} />
          )}
          <span className='flex min-w-0 flex-1 items-center gap-2.5'>
            <span
              aria-hidden='true'
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg border',
                isAutoSelected
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/70 bg-muted/50 text-muted-foreground'
              )}
            >
              {renderGroupLeadingIcon(selectedOption, isAutoSelected, 15)}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-sm font-medium'>
                {selectedOption?.label || placeholder || t('Select a group')}
              </span>
              {selectedOption?.desc && (
                <span className='text-muted-foreground block truncate text-xs'>
                  {selectedOption.desc}
                </span>
              )}
            </span>
            <span className='shrink-0'>
              <GroupRatioBadge
                ratio={selectedOption?.ratio}
                isAuto={isAutoSelected}
                shouldReduceMotion={shouldReduceMotion}
              />
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden='true'
            className='text-muted-foreground size-4 shrink-0 opacity-70'
          />
        </PopoverTrigger>

        <PopoverContent
          className='data-closed:zoom-out-100 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0 data-[side=top]:slide-in-from-bottom-0 w-[var(--anchor-width)] overflow-hidden rounded-xl p-0 shadow-xl data-closed:duration-75 data-open:duration-100'
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <div className='border-border/60 flex items-center border-b pr-2'>
              <div className='min-w-0 flex-1 [&_[data-slot=command-input-wrapper]]:border-b-0'>
                <CommandInput
                  placeholder={t('Search...')}
                  value={searchValue}
                  onValueChange={setSearchValue}
                />
              </div>
              {canSortByRatio ? (
                <Button
                  type='button'
                  size='sm'
                  variant={sortByRatio ? 'secondary' : 'ghost'}
                  className='h-7 shrink-0 gap-1 rounded-md px-2 text-[11px]'
                  onClick={() => setSortByRatio((v) => !v)}
                >
                  <ArrowUpDown className='size-3' aria-hidden='true' />
                  <span>
                    {sortByRatio ? t('Lowest ratio') : t('Default order')}
                  </span>
                </Button>
              ) : null}
            </div>

            <CommandList className='max-h-[320px] p-1'>
              <CommandEmpty>{t('No group found.')}</CommandEmpty>

              {autoOptions.length > 0 && (
                <CommandGroup heading={t('Smart Routing')}>
                  {autoOptions.map(renderGroupOption)}
                </CommandGroup>
              )}

              {standardOptions.length > 0 && (
                <CommandGroup
                  heading={
                    autoOptions.length > 0 ? t('Dedicated Groups') : undefined
                  }
                >
                  {standardOptions.map(renderGroupOption)}
                </CommandGroup>
              )}
            </CommandList>

            <div className='border-border/60 bg-muted/30 text-muted-foreground flex items-center justify-between border-t px-3 py-1.5 text-[11px]'>
              <span>
                {t('{{count}} groups available', { count: options.length })}
              </span>
              <span>{t('Lower multiplier means lower cost')}</span>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {quickChipOptions.length > 0 ? (
        <div
          className='flex flex-wrap items-center gap-1.5'
          data-slot='group-quick-chips'
        >
          {quickChipOptions.map((option) => {
            const active = option.value === value
            const isAuto = option.value === 'auto'
            let ratioDisplay: string | null = null
            if (typeof option.ratio === 'number') {
              ratioDisplay = `${option.ratio}x`
            } else if (isAuto) {
              ratioDisplay = t('Auto')
            }
            return (
              <button
                key={option.value}
                type='button'
                disabled={disabled}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground font-medium'
                    : 'border-border/60 bg-muted/25 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {isAuto ? (
                  <Sparkles
                    className='text-primary size-3 shrink-0'
                    aria-hidden='true'
                  />
                ) : null}
                <span className='max-w-28 truncate'>{option.label}</span>
                {ratioDisplay ? (
                  <span className='text-muted-foreground font-mono text-[10px] tabular-nums'>
                    {ratioDisplay}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
