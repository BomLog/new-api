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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { Hero } from '../components/sections/hero'

afterEach(() => {
  window.localStorage.clear()
})

async function renderHero(
  isAuthenticated: boolean,
  statusOverrides: Record<string, unknown> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    docs_link: 'https://docs.example.com',
    server_address: 'https://api.example.com',
    ...statusOverrides,
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Hero isAuthenticated={isAuthenticated} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

test('guests see sign-up and pricing actions instead of the dashboard link', async () => {
  await renderHero(false)

  expect(
    await screen.findByRole('button', { name: 'Get Started' })
  ).toHaveAttribute('href', '/sign-up')
  expect(screen.getByRole('button', { name: 'View Pricing' })).toHaveAttribute(
    'href',
    '/pricing'
  )
  expect(
    screen.queryByRole('button', { name: 'Go to Dashboard' })
  ).not.toBeInTheDocument()
})

test('signed-in users get the dashboard link and the configured docs link', async () => {
  await renderHero(true)

  expect(
    await screen.findByRole('button', { name: 'Go to Dashboard' })
  ).toHaveAttribute('href', '/dashboard')
  expect(screen.getByRole('button', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://docs.example.com'
  )
  expect(
    screen.queryByRole('button', { name: 'Get Started' })
  ).not.toBeInTheDocument()
})

test('hero renders BOOM branding, triggers shockwave badge, and switches quickstart protocol tabs', async () => {
  const user = userEvent.setup()
  await renderHero(false)

  await screen.findByRole('heading', { level: 1 })
  expect(document.querySelector('canvas')).not.toBeInTheDocument()
  expect(screen.getAllByText('BOOM').length).toBeGreaterThanOrEqual(2)

  const boomTrigger = screen.getByRole('button', {
    name: 'Trigger BOOM shockwave',
  })
  await user.click(boomTrigger)

  expect(screen.getByText('/v1/chat/completions')).toBeInTheDocument()
  expect(screen.getByText('gpt-4o')).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Claude' }))
  expect(screen.getByText('/v1/messages')).toBeInTheDocument()
  expect(await screen.findByText('claude-sonnet-4-5')).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Gemini' }))
  expect(
    screen.getByText('/v1beta/models/gemini-2.5-pro:generateContent')
  ).toBeInTheDocument()
  expect(await screen.findByText('gemini-2.5-pro')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
})

test('renders enabled custom buttons configured for home and hides pricing-only buttons', async () => {
  await renderHero(false, {
    HeaderNavModules: JSON.stringify({
      customButtons: [
        {
          id: 'home-cta',
          label: 'Launch Playground',
          href: '/playground',
          placements: ['home', 'pricing'],
          variant: 'glow',
          openInNewTab: false,
          requireAuth: false,
          enabled: true,
        },
        {
          id: 'pricing-only',
          label: 'Pricing Action',
          href: '/rankings',
          placements: ['pricing'],
          variant: 'outline',
          openInNewTab: false,
          requireAuth: false,
          enabled: true,
        },
      ],
    }),
  })

  expect(
    await screen.findByRole('button', { name: 'Launch Playground' })
  ).toHaveAttribute('href', '/playground')
  expect(
    screen.queryByRole('button', { name: 'Pricing Action' })
  ).not.toBeInTheDocument()
})
