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
import type { PricingModel, PricingVendor } from '@/features/pricing/types'

import type { ApiKeyGroupOption } from '../components/api-key-group-combobox'

export type VendorIconPreset = {
  id: string
  name: string
  iconKey: string
  patterns: RegExp[]
}

const VENDOR_ICON_PRESETS: readonly VendorIconPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    iconKey: 'OpenAI',
    patterns: [/\bopenai\b/i, /\bgpt/i, /\bchatgpt/i, /\bo[134](?:-|\b)/i, /\bdall-?e/i, /\bwhisper/i, /\bsora/i, /\btext-embedding/i],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    iconKey: 'Claude.Color',
    patterns: [/\banthropic\b/i, /\bclaude/i],
  },
  {
    id: 'google',
    name: 'Google',
    iconKey: 'Gemini.Color',
    patterns: [/\bgoogle\b/i, /\bgemini/i, /\bgemma/i, /\bimagen/i, /\bveo/i, /\bvertex/i],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    iconKey: 'DeepSeek.Color',
    patterns: [/\bdeepseek/i],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    iconKey: 'Qwen.Color',
    patterns: [/\bqwen/i, /\bqwq/i, /\btongyi\b/i, /\balibaba\b/i, /\bbailian\b/i],
  },
  {
    id: 'xai',
    name: 'xAI',
    iconKey: 'Grok',
    patterns: [/\bxai\b/i, /\bgrok/i],
  },
  {
    id: 'meta',
    name: 'Meta',
    iconKey: 'Meta.Color',
    patterns: [/\bmeta\b/i, /\bllama/i],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    iconKey: 'Mistral.Color',
    patterns: [/\bmistral/i, /\bmixtral/i, /\bcodestral/i, /\bpixtral/i],
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    iconKey: 'Moonshot',
    patterns: [/\bmoonshot/i, /\bkimi/i],
  },
  {
    id: 'zhipu',
    name: 'Zhipu',
    iconKey: 'Zhipu.Color',
    patterns: [/\bzhipu/i, /\bglm/i, /\bchatglm/i],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    iconKey: 'Minimax.Color',
    patterns: [/\bminimax/i, /\babab/i],
  },
  {
    id: 'doubao',
    name: 'Volcengine',
    iconKey: 'Doubao.Color',
    patterns: [/\bdoubao/i, /\bseedream/i, /\bseedance/i, /\bvolc/i, /\bbytedance/i],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    iconKey: 'Cohere.Color',
    patterns: [/\bcohere/i, /\bcommand-?r/i],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    iconKey: 'Perplexity.Color',
    patterns: [/\bperplexity/i, /\bsonar/i],
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    iconKey: 'Midjourney',
    patterns: [/\bmidjourney/i, /\bmj_/i],
  },
  {
    id: 'kling',
    name: 'Kling',
    iconKey: 'Kling.Color',
    patterns: [/\bkling/i],
  },
  {
    id: 'suno',
    name: 'Suno',
    iconKey: 'Suno',
    patterns: [/\bsuno/i],
  },
]

export function inferVendorPreset(text: string): VendorIconPreset | null {
  const value = text.trim()
  if (!value) return null
  for (const preset of VENDOR_ICON_PRESETS) {
    if (preset.patterns.some((pattern) => pattern.test(value))) {
      return preset
    }
  }
  return null
}

export function resolveModelIconKey(
  modelName: string,
  explicitIcon?: string | null
): string | null {
  if (explicitIcon && explicitIcon.trim()) {
    return explicitIcon.trim()
  }
  return inferVendorPreset(modelName)?.iconKey ?? null
}

export type VendorGroupEntry = {
  id: string
  name: string
  iconKey: string | null
  groups: Array<{
    option: ApiKeyGroupOption
    models: Array<{ name: string; iconKey: string | null }>
  }>
  totalModels: number
}

export type GroupModelDetail = {
  name: string
  iconKey: string | null
  vendorId: string
  vendorName: string
  vendorIconKey: string | null
  quotaType?: number
  modelRatio?: number
  modelPrice?: number
  contextLength?: number
}

export type GroupModelsSummary = {
  totalModels: number
  vendors: Array<{
    id: string
    name: string
    iconKey: string | null
    count: number
  }>
  models: GroupModelDetail[]
}

export function formatContextLengthBadge(
  contextLength?: number
): string | null {
  if (!contextLength || !Number.isFinite(contextLength) || contextLength <= 0) {
    return null
  }
  if (contextLength >= 1_000_000) {
    const m = contextLength / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}K`
  }
  return String(contextLength)
}

function compareGroupByRatio(
  a: { option: ApiKeyGroupOption; models: Array<{ name: string }> },
  b: { option: ApiKeyGroupOption; models: Array<{ name: string }> }
): number {
  const ratioA =
    typeof a.option.ratio === 'number' && Number.isFinite(a.option.ratio)
      ? a.option.ratio
      : Number.POSITIVE_INFINITY
  const ratioB =
    typeof b.option.ratio === 'number' && Number.isFinite(b.option.ratio)
      ? b.option.ratio
      : Number.POSITIVE_INFINITY
  if (ratioA !== ratioB) return ratioA - ratioB
  return b.models.length - a.models.length
}

/**
 * Aggregates available API key groups by model vendor using live `/api/pricing`
 * metadata when available, and gracefully infers vendor associations from user
 * models / group names as a fallback.
 */
export function buildVendorGroupDirectory(params: {
  groups: ApiKeyGroupOption[]
  pricingModels?: PricingModel[]
  pricingVendors?: PricingVendor[]
  userModels?: string[]
}): VendorGroupEntry[] {
  const groupMap = new Map<string, ApiKeyGroupOption>()
  for (const option of params.groups) {
    if (option.value !== 'auto') {
      groupMap.set(option.value, option)
    }
  }

  const vendorMap = new Map<number, PricingVendor>()
  for (const vendor of params.pricingVendors ?? []) {
    vendorMap.set(vendor.id, vendor)
  }

  const entries = new Map<
    string,
    {
      id: string
      name: string
      iconKey: string | null
      groupModels: Map<string, Map<string, string | null>>
      allModels: Set<string>
    }
  >()

  const ensureEntry = (id: string, name: string, iconKey: string | null) => {
    let entry = entries.get(id)
    if (!entry) {
      entry = {
        id,
        name,
        iconKey,
        groupModels: new Map(),
        allModels: new Set(),
      }
      entries.set(id, entry)
    } else if (!entry.iconKey && iconKey) {
      entry.iconKey = iconKey
    }
    return entry
  }

  const pricingModels = params.pricingModels ?? []
  for (const model of pricingModels) {
    const vendor = model.vendor_id ? vendorMap.get(model.vendor_id) : undefined
    const inferred = inferVendorPreset(
      `${vendor?.name ?? ''} ${model.model_name}`
    )
    const vendorName = vendor?.name?.trim() || inferred?.name
    if (!vendorName) continue

    let vendorId = `name:${vendorName.toLowerCase()}`
    if (inferred) {
      vendorId = `preset:${inferred.id}`
    } else if (vendor) {
      vendorId = `vendor:${vendor.id}`
    }
    const vendorIconKey =
      vendor?.icon?.trim() ||
      model.vendor_icon?.trim() ||
      inferred?.iconKey ||
      null
    const modelIconKey =
      resolveModelIconKey(model.model_name, model.icon) ?? vendorIconKey

    const matchedGroupValues = (model.enable_groups ?? []).filter((g) =>
      groupMap.has(g)
    )
    if (matchedGroupValues.length === 0) continue

    const entry = ensureEntry(vendorId, vendorName, vendorIconKey)
    entry.allModels.add(model.model_name)

    for (const groupName of matchedGroupValues) {
      let modelsInGroup = entry.groupModels.get(groupName)
      if (!modelsInGroup) {
        modelsInGroup = new Map()
        entry.groupModels.set(groupName, modelsInGroup)
      }
      modelsInGroup.set(model.model_name, modelIconKey)
    }
  }

  // Fallback when `/api/pricing` has no vendor-group links yet: infer from
  // available user models and group names/descriptions.
  if (entries.size === 0) {
    const fallbackGroups = [...groupMap.values()]
    for (const option of fallbackGroups) {
      const preset = inferVendorPreset(`${option.label} ${option.desc ?? ''}`)
      if (!preset) continue
      const entry = ensureEntry(
        `preset:${preset.id}`,
        preset.name,
        preset.iconKey
      )
      if (!entry.groupModels.has(option.value)) {
        entry.groupModels.set(option.value, new Map())
      }
    }

    for (const modelName of params.userModels ?? []) {
      const preset = inferVendorPreset(modelName)
      if (!preset) continue
      const entry = ensureEntry(
        `preset:${preset.id}`,
        preset.name,
        preset.iconKey
      )
      entry.allModels.add(modelName)
      const matchingGroups = fallbackGroups.filter((option) =>
        preset.patterns.some((pattern) =>
          pattern.test(`${option.label} ${option.desc ?? ''}`)
        )
      )
      const targetGroups =
        matchingGroups.length > 0 ? matchingGroups : fallbackGroups
      for (const option of targetGroups) {
        let modelsInGroup = entry.groupModels.get(option.value)
        if (!modelsInGroup) {
          modelsInGroup = new Map()
          entry.groupModels.set(option.value, modelsInGroup)
        }
        modelsInGroup.set(modelName, preset.iconKey)
      }
    }
  }

  const result: VendorGroupEntry[] = []
  for (const entry of entries.values()) {
    const groups = [...entry.groupModels.entries()]
      .map(([groupValue, modelsMap]) => {
        const option = groupMap.get(groupValue)
        if (!option) return null
        return {
          option,
          models: [...modelsMap.entries()].map(([name, iconKey]) => ({
            name,
            iconKey,
          })),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(compareGroupByRatio)

    if (groups.length === 0) continue
    result.push({
      id: entry.id,
      name: entry.name,
      iconKey: entry.iconKey,
      groups,
      totalModels: entry.allModels.size,
    })
  }

  return result.sort((a, b) => {
    if (b.totalModels !== a.totalModels) return b.totalModels - a.totalModels
    return a.name.localeCompare(b.name)
  })
}

/**
 * Builds a complete per-group available models directory (including `auto`)
 * so users can inspect every model, vendor coverage, billing type, and context
 * length supported by any selected group.
 */
export function buildGroupModelsDirectory(params: {
  groups: ApiKeyGroupOption[]
  pricingModels?: PricingModel[]
  pricingVendors?: PricingVendor[]
  userModels?: string[]
}): Map<string, GroupModelsSummary> {
  const validGroups = new Set(
    params.groups.filter((g) => g.value !== 'auto').map((g) => g.value)
  )
  const vendorMap = new Map<number, PricingVendor>()
  for (const vendor of params.pricingVendors ?? []) {
    vendorMap.set(vendor.id, vendor)
  }

  const perGroup = new Map<string, Map<string, GroupModelDetail>>()
  for (const groupName of validGroups) {
    perGroup.set(groupName, new Map())
  }

  const addModelToGroup = (groupName: string, detail: GroupModelDetail) => {
    const bucket = perGroup.get(groupName)
    if (!bucket || bucket.has(detail.name)) return
    bucket.set(detail.name, detail)
  }

  let hasPricingLinks = false
  for (const model of params.pricingModels ?? []) {
    const matchedGroups = (model.enable_groups ?? []).filter((g) =>
      validGroups.has(g)
    )
    if (matchedGroups.length === 0) continue
    hasPricingLinks = true

    const vendor = model.vendor_id ? vendorMap.get(model.vendor_id) : undefined
    const inferred = inferVendorPreset(
      `${vendor?.name ?? ''} ${model.model_name}`
    )
    const vendorName = vendor?.name?.trim() || inferred?.name || 'Other'
    let vendorId = `name:${vendorName.toLowerCase()}`
    if (inferred) {
      vendorId = `preset:${inferred.id}`
    } else if (vendor) {
      vendorId = `vendor:${vendor.id}`
    }
    const vendorIconKey =
      vendor?.icon?.trim() ||
      model.vendor_icon?.trim() ||
      inferred?.iconKey ||
      null
    const iconKey =
      resolveModelIconKey(model.model_name, model.icon) ?? vendorIconKey

    const detail: GroupModelDetail = {
      name: model.model_name,
      iconKey,
      vendorId,
      vendorName,
      vendorIconKey,
      quotaType: model.quota_type,
      modelRatio: model.model_ratio,
      modelPrice: model.model_price,
      contextLength: model.context_length,
    }
    for (const groupName of matchedGroups) {
      addModelToGroup(groupName, detail)
    }
  }

  if (!hasPricingLinks && (params.userModels?.length ?? 0) > 0) {
    for (const modelName of params.userModels ?? []) {
      const preset = inferVendorPreset(modelName)
      const detail: GroupModelDetail = {
        name: modelName,
        iconKey: preset?.iconKey ?? null,
        vendorId: preset ? `preset:${preset.id}` : 'other',
        vendorName: preset?.name ?? 'Other',
        vendorIconKey: preset?.iconKey ?? null,
      }
      for (const groupName of validGroups) {
        addModelToGroup(groupName, detail)
      }
    }
  }

  const summarize = (
    modelsMap: Map<string, GroupModelDetail>
  ): GroupModelsSummary => {
    const vendorCounts = new Map<
      string,
      { id: string; name: string; iconKey: string | null; count: number }
    >()
    const models = [...modelsMap.values()].sort((a, b) => {
      const byVendor = a.vendorName.localeCompare(b.vendorName)
      if (byVendor !== 0) return byVendor
      return a.name.localeCompare(b.name)
    })

    for (const item of models) {
      const existing = vendorCounts.get(item.vendorId)
      if (existing) {
        existing.count += 1
      } else {
        vendorCounts.set(item.vendorId, {
          id: item.vendorId,
          name: item.vendorName,
          iconKey: item.vendorIconKey,
          count: 1,
        })
      }
    }

    const vendors = [...vendorCounts.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })

    return {
      totalModels: models.length,
      vendors,
      models,
    }
  }

  const result = new Map<string, GroupModelsSummary>()
  const allAutoModels = new Map<string, GroupModelDetail>()

  for (const [groupName, modelsMap] of perGroup.entries()) {
    result.set(groupName, summarize(modelsMap))
    for (const [modelName, detail] of modelsMap.entries()) {
      if (!allAutoModels.has(modelName)) {
        allAutoModels.set(modelName, detail)
      }
    }
  }

  if (params.groups.some((g) => g.value === 'auto')) {
    result.set('auto', summarize(allAutoModels))
  }

  return result
}
