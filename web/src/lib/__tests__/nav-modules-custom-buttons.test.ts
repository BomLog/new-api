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
import { describe, expect, it } from 'vitest'

import {
  getCustomButtonsForPlacement,
  parseHeaderNavModules,
  sanitizeCustomButtonHref,
  validateCustomButtonsDraft,
} from '@/lib/nav-modules'

describe('custom header and page navigation buttons', () => {
  it('sanitizes relative paths and http(s) URLs while rejecting unsafe schemes', () => {
    expect(sanitizeCustomButtonHref('/playground')).toBe('/playground')
    expect(sanitizeCustomButtonHref('  https://docs.newapi.pro/guide  ')).toBe(
      'https://docs.newapi.pro/guide'
    )
    expect(sanitizeCustomButtonHref('http://localhost:3000/status')).toBe(
      'http://localhost:3000/status'
    )
    expect(sanitizeCustomButtonHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeCustomButtonHref('data:text/html,<h1>x</h1>')).toBeNull()
    expect(sanitizeCustomButtonHref('//evil.example.com')).toBeNull()
    expect(sanitizeCustomButtonHref('')).toBeNull()
  })

  it('supports multi-select placements and legacy single placement values', () => {
    const raw = JSON.stringify({
      home: true,
      console: true,
      customButtons: [
        {
          id: 'multi-home-pricing',
          label: 'Explore Models',
          href: '/pricing',
          placements: ['home', 'pricing'],
          variant: 'glow',
          openInNewTab: false,
          enabled: true,
        },
        {
          id: 'legacy-all',
          label: 'Status',
          href: 'https://status.example.com',
          placement: 'all',
          variant: 'primary',
          openInNewTab: true,
          enabled: true,
        },
        {
          id: 'legacy-header',
          label: 'Quick Start',
          href: '/playground',
          placement: 'header',
          variant: 'outline',
          enabled: true,
        },
        {
          id: 'disabled-btn',
          label: 'Hidden',
          href: '/about',
          placements: ['header', 'home', 'pricing'],
          enabled: false,
        },
        {
          id: 'unsafe-btn',
          label: 'Bad',
          href: 'javascript:void(0)',
          placements: ['home'],
          enabled: true,
        },
      ],
    })

    const modules = parseHeaderNavModules(raw)
    expect(modules.customButtons).toHaveLength(4)
    expect(modules.customButtons[0]?.placements).toEqual(['home', 'pricing'])
    expect(modules.customButtons[1]?.placements).toEqual([
      'header',
      'home',
      'pricing',
    ])

    expect(
      getCustomButtonsForPlacement(modules, 'header').map((b) => b.id)
    ).toEqual(['legacy-all', 'legacy-header'])
    expect(
      getCustomButtonsForPlacement(modules, 'home').map((b) => b.id)
    ).toEqual(['multi-home-pricing', 'legacy-all'])
    expect(
      getCustomButtonsForPlacement(modules, 'pricing').map((b) => b.id)
    ).toEqual(['multi-home-pricing', 'legacy-all'])
  })

  it('requires at least one selected display location when validating drafts', () => {
    const result = validateCustomButtonsDraft([
      {
        id: 'empty-loc',
        label: 'No Location',
        href: '/playground',
        placements: [],
        variant: 'glow',
        openInNewTab: false,
        requireAuth: false,
        enabled: true,
      },
    ])
    expect(result).toEqual({
      valid: false,
      invalidIndex: 0,
      reason: 'placements',
    })
  })
})
