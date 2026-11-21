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
import type { QueryClient } from '@tanstack/react-query'

import { readCachedStatus, statusQueryOptions } from '@/lib/status-query'

export type ModuleAccess = { enabled: boolean; requireAuth: boolean }

export type HeaderNavModule = 'rankings' | 'pricing'

export type CustomButtonLocation = 'header' | 'home' | 'pricing'
export type CustomButtonPlacement = 'all' | CustomButtonLocation
export type CustomButtonVariant = 'default' | 'primary' | 'outline' | 'glow'

export const CUSTOM_BUTTON_LOCATIONS: readonly CustomButtonLocation[] = [
  'header',
  'home',
  'pricing',
]

export type CustomNavButton = {
  id: string
  label: string
  href: string
  placements: CustomButtonLocation[]
  variant: CustomButtonVariant
  openInNewTab: boolean
  requireAuth: boolean
  enabled: boolean
}

const VALID_LOCATIONS: ReadonlySet<CustomButtonLocation> = new Set(
  CUSTOM_BUTTON_LOCATIONS
)

const VALID_VARIANTS: ReadonlySet<CustomButtonVariant> = new Set([
  'default',
  'primary',
  'outline',
  'glow',
])

const MAX_CUSTOM_NAV_BUTTONS = 20

function parseCustomButtonPlacements(
  rawPlacements: unknown,
  legacyPlacement: unknown
): CustomButtonLocation[] {
  if (Array.isArray(rawPlacements)) {
    const picked = new Set<CustomButtonLocation>()
    for (const item of rawPlacements) {
      if (item === 'all') {
        return [...CUSTOM_BUTTON_LOCATIONS]
      }
      if (VALID_LOCATIONS.has(item as CustomButtonLocation)) {
        picked.add(item as CustomButtonLocation)
      }
    }
    if (picked.size > 0) {
      return CUSTOM_BUTTON_LOCATIONS.filter((loc) => picked.has(loc))
    }
  }

  if (legacyPlacement === 'all') {
    return [...CUSTOM_BUTTON_LOCATIONS]
  }
  if (VALID_LOCATIONS.has(legacyPlacement as CustomButtonLocation)) {
    return [legacyPlacement as CustomButtonLocation]
  }
  return [...CUSTOM_BUTTON_LOCATIONS]
}

/**
 * Validates and normalizes a custom button href.
 * Permits relative app paths (starting with `/` but not `//`) and `http(s)` URLs;
 * rejects dangerous schemes such as `javascript:` or `data:`.
 */
export function sanitizeCustomButtonHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
  } catch {
    return null
  }
  return null
}

export function isExternalCustomHref(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}

export function parseCustomNavButtons(raw: unknown): CustomNavButton[] {
  if (!Array.isArray(raw)) return []
  const buttons: CustomNavButton[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < raw.length && buttons.length < MAX_CUSTOM_NAV_BUTTONS; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const href = sanitizeCustomButtonHref(record.href)
    if (!label || !href) continue

    const rawId =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : `btn-${i + 1}`
    const id = seenIds.has(rawId) ? `${rawId}-${i + 1}` : rawId
    seenIds.add(id)

    const placements = parseCustomButtonPlacements(
      record.placements,
      record.placement
    )

    const variant = VALID_VARIANTS.has(record.variant as CustomButtonVariant)
      ? (record.variant as CustomButtonVariant)
      : 'default'

    buttons.push({
      id,
      label,
      href,
      placements,
      variant,
      openInNewTab: parseHeaderNavBoolean(
        record.openInNewTab,
        isExternalCustomHref(href)
      ),
      requireAuth: parseHeaderNavBoolean(record.requireAuth, false),
      enabled: parseHeaderNavBoolean(record.enabled, true),
    })
  }

  return buttons
}

export type HeaderNavModules = {
  home: boolean
  console: boolean
  pricing: ModuleAccess
  rankings: ModuleAccess
  docs: boolean
  about: boolean
  customButtons: CustomNavButton[]
  [key: string]: boolean | ModuleAccess | CustomNavButton[]
}

const DEFAULT_HEADER_NAV_MODULES: HeaderNavModules = {
  home: true,
  console: true,
  pricing: { enabled: true, requireAuth: false },
  rankings: { enabled: true, requireAuth: false },
  docs: true,
  about: true,
  customButtons: [],
}

const DEFAULTS: Record<HeaderNavModule, ModuleAccess> = {
  pricing: DEFAULT_HEADER_NAV_MODULES.pricing,
  rankings: DEFAULT_HEADER_NAV_MODULES.rankings,
}

function cloneHeaderNavDefaults(): HeaderNavModules {
  return {
    ...DEFAULT_HEADER_NAV_MODULES,
    pricing: { ...DEFAULT_HEADER_NAV_MODULES.pricing },
    rankings: { ...DEFAULT_HEADER_NAV_MODULES.rankings },
    customButtons: [],
  }
}

export function parseHeaderNavBoolean(
  raw: unknown,
  fallback: boolean
): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') {
    if (raw === 1) return true
    if (raw === 0) return false
    return fallback
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function parseAccess(raw: unknown, fallback: ModuleAccess): ModuleAccess {
  if (
    typeof raw === 'boolean' ||
    typeof raw === 'number' ||
    typeof raw === 'string'
  ) {
    return {
      enabled: parseHeaderNavBoolean(raw, fallback.enabled),
      requireAuth: fallback.requireAuth,
    }
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    return {
      enabled: parseHeaderNavBoolean(r.enabled, fallback.enabled),
      requireAuth: parseHeaderNavBoolean(r.requireAuth, fallback.requireAuth),
    }
  }
  return { ...fallback }
}

function parseHeaderNavRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || String(raw).trim() === '') return null
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>

  try {
    return JSON.parse(String(raw)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function parseHeaderNavModules(raw: unknown): HeaderNavModules {
  const result = cloneHeaderNavDefaults()
  const parsed = parseHeaderNavRecord(raw)
  if (!parsed) return result

  Object.entries(parsed).forEach(([key, value]) => {
    if (key === 'pricing') {
      result.pricing = parseAccess(value, result.pricing)
      return
    }
    if (key === 'rankings') {
      result.rankings = parseAccess(value, result.rankings)
      return
    }
    if (key === 'customButtons') {
      result.customButtons = parseCustomNavButtons(value)
      return
    }

    const fallback = result[key]
    if (
      typeof fallback === 'boolean' ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      result[key] = parseHeaderNavBoolean(
        value,
        typeof fallback === 'boolean' ? fallback : true
      )
    }
  })

  return result
}

export function parseHeaderNavModulesFromStatus(
  status: Record<string, unknown> | null
): HeaderNavModules {
  return parseHeaderNavModules(status?.HeaderNavModules)
}

export function getCustomButtonsForPlacement(
  modules: HeaderNavModules,
  location: CustomButtonLocation
): CustomNavButton[] {
  return modules.customButtons.filter(
    (button) => button.enabled && button.placements.includes(location)
  )
}

export function getCustomHeaderLinkClassName(
  variant?: CustomButtonVariant
): string {
  if (variant === 'primary') {
    return 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 shadow-xs'
  }
  if (variant === 'outline') {
    return 'border border-border/70 bg-background/50 text-foreground hover:border-primary/60 hover:bg-accent/60 rounded-lg px-3 py-1.5'
  }
  if (variant === 'glow') {
    return 'border border-sky-400/40 bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-violet-500/20 text-foreground hover:border-sky-300/70 hover:from-sky-500/30 hover:to-violet-500/30 rounded-lg px-3 py-1.5 shadow-[0_0_18px_-6px_oklch(0.7_0.18_245/75%)]'
  }
  return ''
}

export function createEmptyCustomButton(
  defaultPlacement: CustomButtonPlacement = 'all'
): CustomNavButton {
  const placements: CustomButtonLocation[] =
    defaultPlacement === 'all'
      ? [...CUSTOM_BUTTON_LOCATIONS]
      : [defaultPlacement]
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    href: '',
    placements,
    variant: 'glow',
    openInNewTab: false,
    requireAuth: false,
    enabled: true,
  }
}

export function validateCustomButtonsDraft(buttons: CustomNavButton[]): {
  valid: boolean
  invalidIndex: number
  reason: 'label' | 'href' | 'placements' | null
} {
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i]
    if (!button.label.trim()) {
      return { valid: false, invalidIndex: i, reason: 'label' }
    }
    if (!sanitizeCustomButtonHref(button.href)) {
      return { valid: false, invalidIndex: i, reason: 'href' }
    }
    if (button.placements.length === 0) {
      return { valid: false, invalidIndex: i, reason: 'placements' }
    }
  }
  return { valid: true, invalidIndex: -1, reason: null }
}

/**
 * Resolve one module's access flags from an already-loaded status payload.
 *
 * Falls back to the module's default when status is missing or does not carry
 * a `HeaderNavModules` entry for it.
 */
export function getModuleAccessFromStatus(
  status: Record<string, unknown> | null,
  module: HeaderNavModule
): ModuleAccess {
  return parseHeaderNavModulesFromStatus(status)[module] ?? DEFAULTS[module]
}

/**
 * Read module access synchronously from the persisted status snapshot.
 *
 * For render paths that cannot await, such as deciding whether to show a nav
 * item. Never issues a request; use {@link getModuleAccessForGuard} when the
 * caller can await.
 */
export function getModuleAccess(module: HeaderNavModule): ModuleAccess {
  return getModuleAccessFromStatus(readCachedStatus(), module)
}

/**
 * Resolve module access for a router `beforeLoad` guard.
 *
 * Reads through the shared `['status']` cache, so a guard on a fresh page load
 * reuses the request already started during boot instead of issuing its own.
 *
 * Fresh entries resolve immediately. Stale or invalidated entries await a
 * shared refresh before deciding navigation; a background refresh cannot undo
 * a redirect already made by a guard. The backend still authorizes requests.
 *
 * On failure this fails closed, reporting the module as disabled and
 * auth-required.
 */
export async function getModuleAccessForGuard(
  queryClient: QueryClient,
  module: HeaderNavModule
): Promise<ModuleAccess> {
  try {
    const status = await queryClient.fetchQuery(statusQueryOptions)
    return getModuleAccessFromStatus(status, module)
  } catch {
    return { enabled: false, requireAuth: true }
  }
}

/**
 * Whether an admin sidebar entry is enabled by `SidebarModulesAdmin`.
 *
 * Fails open: an absent, blank, or unparsable configuration keeps every module
 * visible, so a status read that has not landed yet cannot blank the sidebar.
 */
export function isSidebarModuleEnabled(
  section: string,
  module: string
): boolean {
  const status = readCachedStatus()
  if (!status) return true

  const raw = status.SidebarModulesAdmin
  if (!raw || String(raw).trim() === '') return true

  try {
    const parsed = JSON.parse(String(raw)) as Record<
      string,
      Record<string, boolean>
    >
    const sectionConfig = parsed[section]
    if (!sectionConfig) return true
    if (sectionConfig.enabled === false) return false
    if (sectionConfig[module] === false) return false
    return true
  } catch {
    return true
  }
}
