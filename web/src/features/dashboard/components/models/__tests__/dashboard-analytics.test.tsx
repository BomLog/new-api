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
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import type { QuotaDataItem } from '../../../types'
import { ChannelRankingPanel } from '../channel-ranking-panel'
import { LogStatCards } from '../log-stat-cards'
import { ModelBreakdownPanel } from '../model-breakdown-panel'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const SAMPLE_DATA: QuotaDataItem[] = [
  {
    model_name: 'claude-sonnet-4-6',
    created_at: 1795264800,
    count: 120,
    quota: 900000,
    token_used: 400000,
    cache_read_tokens: 600000,
    cache_creation_tokens: 80000,
  },
  {
    model_name: 'gpt-4o-mini',
    created_at: 1795268400,
    count: 300,
    quota: 250000,
    token_used: 700000,
    cache_read_tokens: 100000,
    cache_creation_tokens: 20000,
  },
]

type ApiClientMock = {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>
}

const apiClient = api as unknown as ApiClientMock
const originalGet = apiClient.get

afterEach(() => {
  apiClient.get = originalGet
  mockNavigate.mockReset()
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: null },
  }))
})

describe('Redesigned Dashboard Analytics Components', () => {
  test('LogStatCards renders 5 OpenRouter-style KPI cards, token composition bar, and reacts to selectedModel', async () => {
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN } as never,
      },
    }))

    apiClient.get = async () => ({
      data: { success: true, data: SAMPLE_DATA },
    })

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <LogStatCards />
      </I18nextProvider>
    )

    expect(await screen.findByText('420')).toBeInTheDocument()
    expect(screen.getByText('Cache Efficiency')).toBeInTheDocument()
    expect(screen.getByText('Cost / 1M Tokens')).toBeInTheDocument()
    expect(screen.getByText('Token Composition')).toBeInTheDocument()
    expect(screen.getByText('38.9%')).toBeInTheDocument()

    rerender(
      <I18nextProvider i18n={i18n}>
        <LogStatCards selectedModel='claude-sonnet-4-6' />
      </I18nextProvider>
    )

    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('60.0%')).toBeInTheDocument()
  })

  test('ModelBreakdownPanel sorts by quota/calls, supports model focus, and navigates to model logs', () => {
    const onSelect = vi.fn()

    render(
      <TooltipProvider>
        <I18nextProvider i18n={i18n}>
          <ModelBreakdownPanel data={SAMPLE_DATA} onSelectModel={onSelect} />
        </I18nextProvider>
      </TooltipProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Calls' }))
    const topModelButton = screen
      .getAllByRole('button')
      .find(
        (b) =>
          b.textContent?.includes('claude-sonnet-4-6') ||
          b.textContent?.includes('gpt-4o-mini')
      )
    expect(topModelButton?.textContent).toContain('gpt-4o-mini')

    if (topModelButton) {
      fireEvent.click(topModelButton)
    }
    expect(onSelect).toHaveBeenCalledWith('gpt-4o-mini')

    const logButtons = screen.getAllByRole('button', {
      name: 'View model logs',
    })
    fireEvent.click(logButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/usage-logs/$section',
      params: { section: 'common' },
      search: { model: 'gpt-4o-mini' },
    })
  })

  test('ChannelRankingPanel ranks channels by spend and navigates to channel logs', async () => {
    apiClient.get = async (url) => {
      expect(url).toBe('/api/data/flow')
      return {
        data: {
          success: true,
          data: [
            {
              channel_id: 1,
              channel_name: 'Anthropic',
              model_name: 'gpt-4o',
              quota: 150000,
              count: 40,
              token_used: 120000,
            },
            {
              channel_id: 2,
              channel_name: 'OpenAI-Main',
              model_name: 'claude-sonnet-4-6',
              quota: 850000,
              count: 110,
              token_used: 500000,
            },
          ],
        },
      }
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <I18nextProvider i18n={i18n}>
            <ChannelRankingPanel />
          </I18nextProvider>
        </TooltipProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('OpenAI-Main')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('OpenAI-Main · 85.0%')).toBeInTheDocument()

    const channelLogButtons = screen.getAllByRole('button', {
      name: 'View channel logs',
    })
    fireEvent.click(channelLogButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/usage-logs/$section',
      params: { section: 'common' },
      search: { channel: '2', model: undefined },
    })
  })
})
