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
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import {
  parseHeaderNavModules as parseHeaderNavSettings,
  serializeHeaderNavModules,
} from '@/features/system-settings/maintenance/config'
import { useStatus } from '@/hooks/use-status'
import {
  createEmptyCustomButton,
  CUSTOM_BUTTON_LOCATIONS,
  type CustomButtonLocation,
  type CustomButtonPlacement,
  type CustomButtonVariant,
  type CustomNavButton,
  getCustomButtonsForPlacement,
  isExternalCustomHref,
  parseHeaderNavModulesFromStatus,
  sanitizeCustomButtonHref,
  validateCustomButtonsDraft,
} from '@/lib/nav-modules'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

function getBarButtonClassName(
  variant: CustomButtonVariant,
  size: 'default' | 'compact'
): {
  buttonVariant: 'default' | 'outline' | 'secondary'
  className: string
} {
  const heightClass = size === 'compact' ? 'h-9 px-3.5 text-xs' : 'h-11 px-5 text-sm'
  if (variant === 'primary') {
    return {
      buttonVariant: 'default',
      className: cn(
        heightClass,
        'rounded-lg font-medium shadow-[0_0_22px_-6px_oklch(0.7_0.17_250/65%)]'
      ),
    }
  }
  if (variant === 'outline') {
    return {
      buttonVariant: 'outline',
      className: cn(
        heightClass,
        'border-border/60 bg-background/40 hover:border-primary/50 hover:bg-accent/50 rounded-lg font-medium backdrop-blur-xs'
      ),
    }
  }
  if (variant === 'glow') {
    return {
      buttonVariant: 'outline',
      className: cn(
        heightClass,
        'rounded-lg border-sky-400/45 bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-violet-500/20 font-medium text-foreground shadow-[0_0_26px_-6px_oklch(0.72_0.19_250/75%)] backdrop-blur-sm hover:border-sky-300/75 hover:from-sky-500/30 hover:to-violet-500/30'
      ),
    }
  }
  return {
    buttonVariant: 'secondary',
    className: cn(heightClass, 'rounded-lg font-medium'),
  }
}

type CustomButtonsEditorFieldsProps = {
  buttons: CustomNavButton[]
  onChange: (next: CustomNavButton[]) => void
  defaultPlacement?: CustomButtonPlacement
}

export function CustomButtonsEditorFields(
  props: CustomButtonsEditorFieldsProps
) {
  const { t } = useTranslation()

  const locationLabels: Record<CustomButtonLocation, string> = {
    header: t('Header navigation (Home & Console)'),
    home: t('Home hero bar'),
    pricing: t('Model Square bar'),
  }

  const variantLabels: Record<CustomButtonVariant, string> = {
    default: t('Default'),
    primary: t('Primary'),
    outline: t('Outline'),
    glow: t('Cosmic Glow'),
  }

  const updateAt = (index: number, patch: Partial<CustomNavButton>) => {
    const next = props.buttons.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item
    )
    props.onChange(next)
  }

  const toggleLocation = (
    index: number,
    location: CustomButtonLocation,
    checked: boolean
  ) => {
    const current = props.buttons[index]?.placements ?? []
    const nextSet = new Set<CustomButtonLocation>(current)
    if (checked) {
      nextSet.add(location)
    } else {
      nextSet.delete(location)
    }
    const ordered = CUSTOM_BUTTON_LOCATIONS.filter((loc) => nextSet.has(loc))
    updateAt(index, { placements: ordered })
  }

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= props.buttons.length) return
    const next = [...props.buttons]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    props.onChange(next)
  }

  const removeItem = (index: number) => {
    props.onChange(props.buttons.filter((_, idx) => idx !== index))
  }

  const addItem = () => {
    props.onChange([
      ...props.buttons,
      createEmptyCustomButton(props.defaultPlacement ?? 'all'),
    ])
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h4 className='text-sm font-semibold'>{t('Custom Buttons')}</h4>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Add custom action buttons to the home page, console header navigation, and Model Square bar.'
            )}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={addItem}
          disabled={props.buttons.length >= 20}
          className='gap-1.5'
        >
          <Plus className='size-3.5' aria-hidden='true' />
          {t('Add custom button')}
        </Button>
      </div>

      {props.buttons.length === 0 ? (
        <div className='border-border/70 bg-muted/20 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-xs'>
          {t(
            'No custom buttons configured yet. Click "Add custom button" to create links for Home, Console, or Model Square.'
          )}
        </div>
      ) : (
        <div className='space-y-3'>
          {props.buttons.map((button, index) => {
            const hrefInvalid =
              button.href.trim().length > 0 &&
              sanitizeCustomButtonHref(button.href) === null

            return (
              <div
                key={button.id}
                className='border-border/70 bg-card/70 space-y-3 rounded-xl border p-3.5'
              >
                <div className='flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <Badge variant='secondary' className='font-mono text-[11px]'>
                      #{index + 1}
                    </Badge>
                    <span className='max-w-44 truncate text-xs font-medium'>
                      {button.label.trim() || t('Untitled button')}
                    </span>
                  </div>
                  <div className='flex items-center gap-1'>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='size-7'
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label={t('Move up')}
                    >
                      <ArrowUp className='size-3.5' aria-hidden='true' />
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='size-7'
                      disabled={index === props.buttons.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label={t('Move down')}
                    >
                      <ArrowDown className='size-3.5' aria-hidden='true' />
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='text-destructive hover:text-destructive size-7'
                      onClick={() => removeItem(index)}
                      aria-label={t('Remove button')}
                    >
                      <Trash2 className='size-3.5' aria-hidden='true' />
                    </Button>
                  </div>
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor={`custom-btn-label-${button.id}`}>
                      {t('Button label')}
                    </Label>
                    <Input
                      id={`custom-btn-label-${button.id}`}
                      value={button.label}
                      placeholder={t('e.g. API Playground')}
                      onChange={(e) =>
                        updateAt(index, { label: e.target.value })
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor={`custom-btn-href-${button.id}`}>
                      {t('Target URL or path')}
                    </Label>
                    <Input
                      id={`custom-btn-href-${button.id}`}
                      value={button.href}
                      aria-invalid={hrefInvalid}
                      placeholder='/playground or https://example.com'
                      onChange={(e) => {
                        const nextHref = e.target.value
                        updateAt(index, {
                          href: nextHref,
                          openInNewTab: isExternalCustomHref(nextHref.trim())
                            ? true
                            : button.openInNewTab,
                        })
                      }}
                    />
                    {hrefInvalid ? (
                      <p className='text-destructive text-[11px]'>
                        {t(
                          'Enter a relative path starting with / or an http(s) URL.'
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className='space-y-3'>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <Label>{t('Display locations')}</Label>
                      {button.placements.length <
                      CUSTOM_BUTTON_LOCATIONS.length ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-6 px-2 text-xs'
                          onClick={() =>
                            updateAt(index, {
                              placements: [...CUSTOM_BUTTON_LOCATIONS],
                            })
                          }
                        >
                          {t('Select all')}
                        </Button>
                      ) : null}
                    </div>
                    <div className='grid gap-2 sm:grid-cols-3'>
                      {CUSTOM_BUTTON_LOCATIONS.map((location) => {
                        const checked = button.placements.includes(location)
                        const checkboxId = `custom-btn-loc-${button.id}-${location}`
                        return (
                          <label
                            key={location}
                            htmlFor={checkboxId}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors',
                              checked
                                ? 'border-primary/60 bg-primary/10 text-foreground'
                                : 'border-border/70 bg-background/40 text-muted-foreground hover:border-border'
                            )}
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggleLocation(index, location, Boolean(value))
                              }
                            />
                            <span className='leading-tight'>
                              {locationLabels[location]}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {button.placements.length === 0 ? (
                      <p className='text-destructive text-[11px]'>
                        {t('Please select at least one display location.')}
                      </p>
                    ) : null}
                  </div>

                  <div className='space-y-1.5 sm:max-w-xs'>
                    <Label>{t('Button style')}</Label>
                    <Select
                      value={button.variant}
                      onValueChange={(value) => {
                        if (value) {
                          updateAt(index, {
                            variant: value as CustomButtonVariant,
                          })
                        }
                      }}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue>
                          {variantLabels[button.variant]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='glow'>
                          {variantLabels.glow}
                        </SelectItem>
                        <SelectItem value='primary'>
                          {variantLabels.primary}
                        </SelectItem>
                        <SelectItem value='outline'>
                          {variantLabels.outline}
                        </SelectItem>
                        <SelectItem value='default'>
                          {variantLabels.default}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-x-5 gap-y-2 pt-1'>
                  <label className='flex cursor-pointer items-center gap-2 text-xs'>
                    <Switch
                      checked={button.enabled}
                      onCheckedChange={(checked) =>
                        updateAt(index, { enabled: checked })
                      }
                    />
                    <span>{t('Enabled')}</span>
                  </label>
                  <label className='flex cursor-pointer items-center gap-2 text-xs'>
                    <Switch
                      checked={button.openInNewTab}
                      onCheckedChange={(checked) =>
                        updateAt(index, { openInNewTab: checked })
                      }
                    />
                    <span>{t('Open in new tab')}</span>
                  </label>
                  <label className='flex cursor-pointer items-center gap-2 text-xs'>
                    <Switch
                      checked={button.requireAuth}
                      onCheckedChange={(checked) =>
                        updateAt(index, { requireAuth: checked })
                      }
                    />
                    <span>{t('Require sign-in')}</span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type CustomButtonsManagerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPlacement?: CustomButtonPlacement
}

export function CustomButtonsManagerDialog(
  props: CustomButtonsManagerDialogProps
) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const updateOption = useUpdateOption()

  const rawHeaderNav =
    typeof status?.HeaderNavModules === 'string'
      ? status.HeaderNavModules
      : undefined
  const currentConfig = useMemo(
    () => parseHeaderNavSettings(rawHeaderNav),
    [rawHeaderNav]
  )

  const [draftButtons, setDraftButtons] = useState<CustomNavButton[]>(
    currentConfig.customButtons
  )

  useEffect(() => {
    if (props.open) {
      setDraftButtons(currentConfig.customButtons)
    }
  }, [props.open, currentConfig.customButtons])

  const handleSave = async () => {
    const validation = validateCustomButtonsDraft(draftButtons)
    if (!validation.valid) {
      let message = t('Please enter a valid relative path or http(s) URL.')
      if (validation.reason === 'label') {
        message = t('Please enter a label for every custom button.')
      } else if (validation.reason === 'placements') {
        message = t('Please select at least one display location.')
      }
      toast.error(message)
      return
    }

    const serialized = serializeHeaderNavModules({
      ...currentConfig,
      customButtons: draftButtons,
    })

    await updateOption.mutateAsync({
      key: 'HeaderNavModules',
      value: serialized,
    })
    props.onOpenChange(false)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Customize Action Buttons')}
      description={t(
        'Configure custom buttons displayed across the home page, console header navigation, and Model Square bar.'
      )}
      contentClassName='sm:max-w-2xl'
      contentHeight='min(65vh, 520px)'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={updateOption.isPending}
            onClick={() => void handleSave()}
          >
            {updateOption.isPending ? t('Saving...') : t('Save buttons')}
          </Button>
        </>
      }
    >
      <CustomButtonsEditorFields
        buttons={draftButtons}
        onChange={setDraftButtons}
        defaultPlacement={props.defaultPlacement}
      />
    </Dialog>
  )
}

type CustomButtonsQuickTriggerProps = {
  defaultPlacement?: CustomButtonPlacement
  className?: string
  showLabel?: boolean
}

export function CustomButtonsQuickTrigger(
  props: CustomButtonsQuickTriggerProps
) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const user = useAuthStore((s) => s.auth.user)
  const isSuperAdmin = (user?.role ?? 0) >= ROLE.SUPER_ADMIN

  if (!isSuperAdmin) return null

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size={props.showLabel ? 'sm' : 'icon'}
        onClick={() => setOpen(true)}
        aria-label={t('Customize buttons')}
        title={t('Customize buttons')}
        className={cn(
          props.showLabel
            ? 'border-border/50 bg-background/40 hover:border-primary/50 hover:bg-accent/50 h-9 gap-1.5 rounded-lg px-3 text-xs font-medium backdrop-blur-xs'
            : 'size-8 rounded-lg',
          props.className
        )}
      >
        <SlidersHorizontal className='size-3.5' aria-hidden='true' />
        {props.showLabel ? <span>{t('Customize buttons')}</span> : null}
      </Button>
      <CustomButtonsManagerDialog
        open={open}
        onOpenChange={setOpen}
        defaultPlacement={props.defaultPlacement}
      />
    </>
  )
}

type CustomButtonsBarProps = {
  placement: Exclude<CustomButtonPlacement, 'all'>
  size?: 'default' | 'compact'
  className?: string
  showAdminTrigger?: boolean
}

export function CustomButtonsBar(props: CustomButtonsBarProps) {
  const navigate = useNavigate()
  const { status } = useStatus()
  const user = useAuthStore((s) => s.auth.user)
  const isAuthed = !!user
  const isSuperAdmin = (user?.role ?? 0) >= ROLE.SUPER_ADMIN
  const size = props.size ?? 'default'

  const buttons = useMemo(() => {
    const modules = parseHeaderNavModulesFromStatus(
      status as Record<string, unknown> | null
    )
    return getCustomButtonsForPlacement(modules, props.placement)
  }, [status, props.placement])

  const shouldShowAdminTrigger =
    (props.showAdminTrigger ?? true) && isSuperAdmin

  if (buttons.length === 0 && !shouldShowAdminTrigger) {
    return null
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2.5', props.className)}
      data-slot='custom-buttons-bar'
    >
      {buttons.map((button) => {
        const external =
          button.openInNewTab || isExternalCustomHref(button.href)
        const needsLogin = button.requireAuth && !isAuthed
        const { buttonVariant, className } = getBarButtonClassName(
          button.variant,
          size
        )

        if (needsLogin) {
          return (
            <Button
              key={button.id}
              type='button'
              variant={buttonVariant}
              className={className}
              onClick={() =>
                void navigate({
                  to: '/sign-in',
                  search: { redirect: button.href },
                })
              }
            >
              {button.variant === 'glow' ? (
                <Sparkles className='size-3.5 text-sky-300' aria-hidden='true' />
              ) : null}
              <span>{button.label}</span>
            </Button>
          )
        }

        if (external) {
          return (
            <Button
              key={button.id}
              variant={buttonVariant}
              className={className}
              render={
                <a
                  href={button.href}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {button.variant === 'glow' ? (
                <Sparkles className='size-3.5 text-sky-300' aria-hidden='true' />
              ) : null}
              <span>{button.label}</span>
              <ExternalLink
                className='size-3.5 opacity-70'
                aria-hidden='true'
              />
            </Button>
          )
        }

        return (
          <Button
            key={button.id}
            variant={buttonVariant}
            className={className}
            render={<Link to={button.href} />}
          >
            {button.variant === 'glow' ? (
              <Sparkles className='size-3.5 text-sky-300' aria-hidden='true' />
            ) : null}
            <span>{button.label}</span>
          </Button>
        )
      })}

      {shouldShowAdminTrigger ? (
        <CustomButtonsQuickTrigger
          defaultPlacement={props.placement}
          showLabel
          className={size === 'default' ? 'h-11 px-4 text-sm' : undefined}
        />
      ) : null}
    </div>
  )
}
