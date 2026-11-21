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
import { describe, expect, test } from 'vitest'

import { getCacheHitRateMetrics, getCacheHitRateTextClass } from '../format'

describe('getCacheHitRateMetrics', () => {
  test('computes OpenAI-style hit rate where prompt_tokens includes cache_tokens', () => {
    const result = getCacheHitRateMetrics(15000, { cache_tokens: 12000 })
    expect(result.totalInputTokens).toBe(15000)
    expect(result.hitRatePercent).toBe(80)
    expect(result.formattedPercent).toBe('80%')
    expect(result.tone).toBe('excellent')
    expect(getCacheHitRateTextClass(result.tone)).toContain('emerald')
  })

  test('computes Claude/Anthropic-style hit rate where cache read/write are reported separately', () => {
    const result = getCacheHitRateMetrics(4000, {
      claude: true,
      usage_semantic: 'anthropic',
      cache_tokens: 10000,
      cache_creation_tokens_5m: 4000,
    })
    expect(result.totalInputTokens).toBe(18000)
    expect(result.hitRatePercent).toBe(55.6)
    expect(result.formattedPercent).toBe('55.6%')
    expect(result.tone).toBe('good')
    expect(getCacheHitRateTextClass(result.tone)).toContain('sky')
  })

  test('classifies fair (20-49.9%) and low (<20%) hit rates with distinct color tones', () => {
    const fair = getCacheHitRateMetrics(10000, { cache_tokens: 3500 })
    expect(fair.formattedPercent).toBe('35%')
    expect(fair.tone).toBe('fair')
    expect(getCacheHitRateTextClass(fair.tone)).toContain('amber')

    const low = getCacheHitRateMetrics(8000, {
      cache_tokens: 1500,
      input_tokens_total: 8000,
    })
    expect(low.formattedPercent).toBe('18.8%')
    expect(low.tone).toBe('low')
    expect(getCacheHitRateTextClass(low.tone)).toContain('rose')
  })

  test('computes actual 0% for requests with input tokens and no cache hit, and null when input is 0', () => {
    const warmup = getCacheHitRateMetrics(2000, {
      claude: true,
      cache_tokens: 0,
      cache_creation_tokens_5m: 10000,
    })
    expect(warmup.totalInputTokens).toBe(12000)
    expect(warmup.hitRatePercent).toBe(0)
    expect(warmup.formattedPercent).toBe('0%')
    expect(warmup.tone).toBe('zero')

    const plain = getCacheHitRateMetrics(1200, {})
    expect(plain.totalInputTokens).toBe(1200)
    expect(plain.hitRatePercent).toBe(0)
    expect(plain.formattedPercent).toBe('0%')
    expect(plain.tone).toBe('zero')

    const empty = getCacheHitRateMetrics(0, {})
    expect(empty.hitRatePercent).toBeNull()
    expect(empty.formattedPercent).toBeNull()
  })
})
