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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import { api } from '@/lib/api'

import { ApiKeyVendorGroupPicker } from '../api-key-vendor-group-picker'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiClientMock = {
  get: (url: string) => Promise<{ data: unknown }>
}

const apiClient = api as unknown as ApiClientMock
const originalGet = apiClient.get

afterEach(() => {
  apiClient.get = originalGet
})

function installPricingFixture() {
  apiClient.get = async (url) => {
    expect(url).toBe('/api/pricing')
    return {
      data: {
        success: true,
        vendors: [
          { id: 1, name: 'OpenAI', icon: 'OpenAI' },
          { id: 2, name: 'Anthropic', icon: 'Claude.Color' },
        ],
        data: [
          {
            id: 101,
            model_name: 'gpt-4o',
            vendor_id: 1,
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            context_length: 128000,
            enable_groups: ['default', 'claude-eco'],
          },
          ...[
            'claude-sonnet-4',
            'claude-opus-4',
            'claude-haiku-3.5',
            'claude-3-7-sonnet',
            'claude-3-5-sonnet',
            'claude-3-opus',
            'claude-3-haiku',
          ].map((modelName, idx) => ({
            id: 200 + idx,
            model_name: modelName,
            vendor_id: 2,
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            context_length: 200000,
            enable_groups: ['claude-vip', 'claude-eco'],
          })),
        ],
      },
    }
  }
}

describe('ApiKeyVendorGroupPicker', () => {
  test('filters channels by vendor without changing selection until clicked, recommends lowest ratio, and expands full models', async () => {
    installPricingFixture()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Harness() {
      const [selected, setSelected] = useState('auto')
      return (
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ApiKeyVendorGroupPicker
              groups={[
                {
                  value: 'auto',
                  label: 'auto',
                  desc: 'Auto routing',
                  ratio: 'auto',
                },
                {
                  value: 'default',
                  label: 'default',
                  desc: 'Standard',
                  ratio: 1,
                },
                {
                  value: 'claude-vip',
                  label: 'claude-vip',
                  desc: 'Dedicated Anthropic route',
                  ratio: 2,
                },
                {
                  value: 'claude-eco',
                  label: 'claude-eco',
                  desc: 'Budget Anthropic route',
                  ratio: 0.8,
                },
              ]}
              userModels={['gpt-4o', 'claude-sonnet-4']}
              selectedGroup={selected}
              onSelectGroup={setSelected}
            />
            <output data-testid='selected-group'>{selected}</output>
          </I18nextProvider>
        </QueryClientProvider>
      )
    }

    render(<Harness />)

    const anthropicTab = await screen.findByRole('tab', {
      name: /Anthropic/i,
    })
    fireEvent.click(anthropicTab)

    // Switching vendor only filters channels; current selection stays 'auto'
    expect(screen.getByTestId('selected-group')).toHaveTextContent('auto')

    // Lowest-ratio channel is marked Recommended
    const ecoOption = await screen.findByRole('button', {
      name: /claude-eco/i,
    })
    const vipOption = await screen.findByRole('button', {
      name: /claude-vip/i,
    })
    expect(ecoOption).toHaveTextContent('Recommended')
    expect(vipOption).not.toHaveTextContent('Recommended')

    // Card inline expand shows all 7 Anthropic models instead of truncating permanently
    expect(screen.queryByText('claude-3-haiku')).not.toBeInTheDocument()
    const expandButtons = document.querySelectorAll(
      '[data-slot="expand-channel-models"]'
    )
    expect(expandButtons.length).toBeGreaterThan(0)
    fireEvent.click(expandButtons[0] as HTMLElement)
    expect(screen.getByText('claude-3-haiku')).toBeInTheDocument()

    // Clicking the channel selects it
    fireEvent.click(ecoOption)
    await waitFor(() =>
      expect(screen.getByTestId('selected-group')).toHaveTextContent(
        'claude-eco'
      )
    )

    // Expanding the footer "Available Models" explorer reveals all cross-vendor models for claude-eco (7 Anthropic + 1 OpenAI = 8)
    const drawerToggle = document.querySelector(
      '[data-slot="toggle-group-models-drawer"]'
    ) as HTMLElement
    fireEvent.click(drawerToggle)
    expect(
      document.querySelector('[data-slot="group-all-models-view"]')
    ).toBeInTheDocument()
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('claude-3-haiku')).toBeInTheDocument()
    expect(screen.getByText('128K')).toBeInTheDocument()
  })

  test('displays Follow user group instead of Select a group when editing an inherited empty group', async () => {
    installPricingFixture()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ApiKeyVendorGroupPicker
            groups={[
              {
                value: 'default',
                label: 'default',
                desc: 'Standard',
                ratio: 1,
              },
            ]}
            userModels={['gpt-4o']}
            selectedGroup=''
            onSelectGroup={() => undefined}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    expect(screen.queryByText('Select a group')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="selected-group-label"]')?.textContent
    ).toBe('Follow user group')
  })

  test('refetches pricing after invalidation so newly bound groups appear without a page reload', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Seed cached pricing that only knows about 'default'
    queryClient.setQueryData(
      ['pricing'],
      {
        success: true,
        vendors: [{ id: 1, name: 'OpenAI', icon: 'OpenAI' }],
        data: [
          {
            id: 101,
            model_name: 'gpt-4o',
            vendor_id: 1,
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ['default'],
          },
        ],
      },
      { updatedAt: Date.now() }
    )

    // Backend now serves a newly added group 'svip' bound to the OpenAI channel
    apiClient.get = async (url) => {
      expect(url).toBe('/api/pricing')
      return {
        data: {
          success: true,
          vendors: [{ id: 1, name: 'OpenAI', icon: 'OpenAI' }],
          data: [
            {
              id: 101,
              model_name: 'gpt-4o',
              vendor_id: 1,
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ['default', 'svip'],
            },
          ],
        },
      }
    }

    // Channel/group mutation invalidates ['pricing']
    await queryClient.invalidateQueries({ queryKey: ['pricing'] })

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ApiKeyVendorGroupPicker
            groups={[
              { value: 'default', label: 'default', desc: 'Standard', ratio: 1 },
              { value: 'svip', label: 'svip', desc: 'Super VIP', ratio: 0.6 },
            ]}
            userModels={['gpt-4o']}
            selectedGroup='default'
            onSelectGroup={() => undefined}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    expect(
      await screen.findByRole('button', { name: /svip/i })
    ).toBeInTheDocument()
  })

  test('falls back gracefully to userModels when /api/pricing is restricted (403)', async () => {
    apiClient.get = async (url) => {
      expect(url).toBe('/api/pricing')
      throw new Error('Forbidden')
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ApiKeyVendorGroupPicker
            groups={[
              { value: 'default', label: 'default', desc: 'Standard', ratio: 1 },
            ]}
            userModels={['gpt-4o']}
            selectedGroup='default'
            onSelectGroup={() => undefined}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    expect(
      await screen.findByRole('tab', { name: /OpenAI/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /default/i })
    ).toBeInTheDocument()
  })
})
