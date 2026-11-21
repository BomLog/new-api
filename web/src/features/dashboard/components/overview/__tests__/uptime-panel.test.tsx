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
import { afterEach, describe, expect, test } from 'vitest'

import { UptimeKumaSection } from '@/features/system-settings/content/uptime-kuma-section'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { UptimePanel } from '../uptime-panel'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiClientMock = {
  get: (url: string) => Promise<{ data: unknown }>
  post: (url: string) => Promise<{ data: unknown }>
}

const apiClient = api as unknown as ApiClientMock
const originalGet = apiClient.get
const originalPost = apiClient.post

afterEach(() => {
  apiClient.get = originalGet
  apiClient.post = originalPost
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: null },
  }))
})

describe('UptimePanel (built-in channel availability)', () => {
  test('renders commercial overall status banner, 30-slot heartbeat bars, and allows root probe trigger', async () => {
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        user: {
          id: 1,
          username: 'root',
          role: ROLE.SUPER_ADMIN,
        } as never,
      },
    }))

    apiClient.get = async (url) => {
      expect(url).toBe('/api/uptime/status')
      return {
        data: {
          success: true,
          data: [
            {
              categoryName: 'Anthropic',
              monitors: [
                {
                  id: '2:claude-sonnet-4-6',
                  name: 'claude-sonnet-4-6',
                  model: 'claude-sonnet-4-6',
                  group: 'vip',
                  uptime: 0.9667,
                  status: 2,
                  avgLatencyMs: 620,
                  lastLatencyMs: 580,
                  lastCheckedAt: 1732194000,
                  totalChecks: 30,
                  successChecks: 29,
                  heartbeats: Array.from({ length: 30 }, (_, i) => ({
                    t: 1732190000 + i * 60,
                    ok: i !== 10,
                    ms: 600,
                  })),
                },
              ],
            },
          ],
        },
      }
    }

    let probeCalled = false
    apiClient.post = async (url) => {
      expect(url).toBe('/api/option/channel_probe/run')
      probeCalled = true
      return {
        data: {
          success: true,
          data: {
            summary: { total: 1, succeeded: 1, failed: 0 },
            groups: [
              {
                categoryName: 'Anthropic',
                monitors: [
                  {
                    id: '2:claude-sonnet-4-6',
                    name: 'claude-sonnet-4-6',
                    model: 'claude-sonnet-4-6',
                    group: 'vip',
                    uptime: 1,
                    status: 1,
                    avgLatencyMs: 500,
                    lastLatencyMs: 500,
                    lastCheckedAt: 1732194060,
                    totalChecks: 30,
                    successChecks: 30,
                    heartbeats: Array.from({ length: 30 }, (_, i) => ({
                      t: 1732190060 + i * 60,
                      ok: true,
                      ms: 500,
                    })),
                  },
                ],
              },
            ],
          },
        },
      }
    }

    render(
      <I18nextProvider i18n={i18n}>
        <UptimePanel />
      </I18nextProvider>
    )

    expect(
      await screen.findByText('Partial performance degradation')
    ).toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-slot="uptime-heartbeat-bar"]').length
    ).toBe(30)

    const probeBtn = screen.getByRole('button', { name: 'Probe now' })
    fireEvent.click(probeBtn)

    await waitFor(() => expect(probeCalled).toBe(true))
    expect(
      await screen.findByText('All channels operational')
    ).toBeInTheDocument()
  })

  test('renders UptimeKumaSection probe target table and controls without runtime errors', async () => {
    apiClient.get = async () => ({
      data: {
        success: true,
        data: {
          items: [
            {
              id: 1,
              name: 'OpenAI Primary',
              status: 1,
              models: 'gpt-4o,gpt-4o-mini',
              group: 'default',
            },
          ],
        },
      },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <UptimeKumaSection
            enabled
            probeEnabled
            intervalMinutes={15}
            options={JSON.stringify({
              prompt: 'hi',
              stream: false,
              queueDelayMs: 500,
              userBusyWindowSec: 30,
              maxDeferSec: 60,
            })}
            data={JSON.stringify([
              {
                id: 'probe-1',
                categoryName: 'OpenAI',
                displayName: 'GPT-4o Main',
                channelId: 1,
                models: ['gpt-4o', 'gpt-4o-mini'],
                group: 'default',
                prompt: 'custom-hello',
                stream: false,
              },
            ])}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('GPT-4o Main')).toBeInTheDocument()
    expect(screen.getByText('custom-hello')).toBeInTheDocument()
    expect(screen.getByLabelText('Probe Prompt')).toHaveValue('hi')
    expect(screen.getByLabelText('Defer on User Traffic Window (Seconds)')).toHaveValue(30)
    expect(screen.getByRole('button', { name: 'Probe now' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Auto-populate' })).toBeVisible()
    const addButton = screen.getByRole('button', { name: 'Add Target' })
    expect(addButton).toBeVisible()

    fireEvent.click(addButton)
    expect(await screen.findByText('Add Probe Target')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Select models from this channel...')
    ).toBeInTheDocument()
  })
})
