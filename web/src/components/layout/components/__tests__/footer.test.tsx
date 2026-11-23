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
import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { Footer } from '../footer'

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: {} }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'New API',
    logo: '/logo.png',
    demoSiteEnabled: false,
    footerHtml:
      '<p>Safe Footer</p><script>window.__footerXss = true</script><img src="x" onerror="window.__imgXss=1" /><a id="evil-link" href="javascript:alert(1)">Evil</a><a id="ext-link" href="https://example.com" target="_blank">External</a>',
  }),
}))

describe('Footer custom HTML sanitization', () => {
  test('strips executable markup and hardens external links', () => {
    const { container } = render(<Footer />)

    expect(container.textContent).toContain('Safe Footer')
    expect(container.querySelector('script')).toBeNull()

    const img = container.querySelector('img[src="x"]')
    expect(img?.getAttribute('onerror')).toBeNull()

    const evilLink = container.querySelector('#evil-link')
    expect(evilLink?.getAttribute('href') ?? '').not.toContain('javascript:')

    const extLink = container.querySelector('#ext-link')
    expect(extLink?.getAttribute('href')).toBe('https://example.com')
    expect(extLink?.getAttribute('rel')).toContain('noopener')
    expect(extLink?.getAttribute('rel')).toContain('noreferrer')
  })
})
