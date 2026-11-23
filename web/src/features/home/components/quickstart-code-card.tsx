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
import { Terminal } from 'lucide-react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'motion/react'
import { useEffect, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'
import { getLobeIcon } from '@/lib/lobe-icon'
import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { BoomEmblem, BoomShockwaveBurst } from './boom-brand-mark'

type ProtocolId = 'openai' | 'claude' | 'gemini'

interface ProtocolSnippet {
  id: ProtocolId
  label: string
  iconKey: string
  modelName: string
  endpoint: string
  streamPreview: string
  buildCurl: (baseUrl: string) => string
}

const PROTOCOL_SNIPPETS: ProtocolSnippet[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    iconKey: 'OpenAI',
    modelName: 'gpt-4o',
    endpoint: '/v1/chat/completions',
    streamPreview:
      'data: {"choices":[{"delta":{"content":"BOOM supernova core routed in 12ms."}}]}',
    buildCurl: (baseUrl) => `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'`,
  },
  {
    id: 'claude',
    label: 'Claude',
    iconKey: 'Claude.Color',
    modelName: 'claude-sonnet-4-5',
    endpoint: '/v1/messages',
    streamPreview:
      'event: content_block_delta · {"delta":{"text":"Routed via BOOM Anthropic warp."}}',
    buildCurl: (baseUrl) => `curl ${baseUrl}/v1/messages \\
  -H "x-api-key: $API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'`,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    iconKey: 'Gemini.Color',
    modelName: 'gemini-2.5-pro',
    endpoint: '/v1beta/models/gemini-2.5-pro:generateContent',
    streamPreview:
      '{"candidates":[{"content":{"parts":[{"text":"BOOM cosmic burst throughput ready."}]}}]}',
    buildCurl: (baseUrl) =>
      `curl ${baseUrl}/v1beta/models/gemini-2.5-pro:generateContent \\
  -H "x-goog-api-key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "Hello" }] }
    ]
  }'`,
  },
]

interface QuickstartCodeCardProps {
  className?: string
}

function resolveBaseUrl(serverAddress: unknown): string {
  if (typeof serverAddress === 'string' && serverAddress.trim().length > 0) {
    return serverAddress.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }
  return 'https://api.example.com'
}

function PlasmaArrowSvg(props: { cyan?: boolean }) {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 48 12'
      fill='none'
      className={cn(
        'h-3 w-8 shrink-0 sm:w-11',
        props.cyan ? 'text-sky-400/90' : 'text-amber-400/90'
      )}
    >
      <line
        x1='0'
        y1='6'
        x2='42'
        y2='6'
        stroke='currentColor'
        strokeOpacity='0.24'
        strokeWidth='1.5'
      />
      <line
        x1='0'
        y1='6'
        x2='42'
        y2='6'
        stroke='currentColor'
        strokeWidth='1.75'
        className='home-beam-line'
      />
      <path
        d='M39 2.5L44 6L39 9.5'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export function QuickstartCodeCard(props: QuickstartCodeCardProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [activeProtocol, setActiveProtocol] = useState<ProtocolId>('openai')
  const [typedChars, setTypedChars] = useState<number>(0)
  const [burstCount, setBurstCount] = useState<number>(0)

  const rawRotateX = useMotionValue(0)
  const rawRotateY = useMotionValue(0)
  const glareX = useMotionValue(50)
  const glareY = useMotionValue(50)
  const rotateX = useSpring(rawRotateX, { damping: 24, stiffness: 220 })
  const rotateY = useSpring(rawRotateY, { damping: 24, stiffness: 220 })
  const glareBackground = useMotionTemplate`radial-gradient(340px circle at ${glareX}% ${glareY}%, rgba(251, 146, 60, 0.16), rgba(56, 189, 248, 0.06) 45%, transparent 72%)`

  const handleCardMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    rawRotateX.set((0.5 - py) * 7)
    rawRotateY.set((px - 0.5) * 7)
    glareX.set(px * 100)
    glareY.set(py * 100)
  }

  const handleCardMouseLeave = () => {
    rawRotateX.set(0)
    rawRotateY.set(0)
  }

  const baseUrl = resolveBaseUrl(status?.server_address)
  const currentSnippet =
    PROTOCOL_SNIPPETS.find((item) => item.id === activeProtocol) ??
    PROTOCOL_SNIPPETS[0]
  const currentCode = currentSnippet.buildCurl(baseUrl)

  useEffect(() => {
    const fullLength = currentSnippet.streamPreview.length
    setTypedChars(0)
    const timer = window.setInterval(() => {
      setTypedChars((prev) => {
        if (prev >= fullLength) {
          window.clearInterval(timer)
          return fullLength
        }
        return prev + 2
      })
    }, 16)

    return () => window.clearInterval(timer)
  }, [currentSnippet.streamPreview])

  const previewText = currentSnippet.streamPreview.slice(0, typedChars)

  return (
    <motion.div
      onMouseMove={handleCardMouseMove}
      onMouseLeave={handleCardMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      className={cn('relative rounded-2xl p-px', props.className)}
    >
      {/* Multi-spectrum supernova rotating conic border beam */}
      <div
        aria-hidden='true'
        className='boom-flow-border pointer-events-none absolute inset-0 rounded-2xl opacity-95'
      />

      <div className='relative overflow-hidden rounded-2xl border border-white/12 bg-[#090c17]/95 shadow-[0_28px_80px_-24px_rgba(249,115,22,0.28)]'>
        <motion.div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 z-20'
          style={{ background: glareBackground }}
        />

        <Tabs
          value={activeProtocol}
          onValueChange={(value) => {
            if (
              value === 'openai' ||
              value === 'claude' ||
              value === 'gemini'
            ) {
              setActiveProtocol(value)
              setBurstCount((prev) => prev + 1)
            }
          }}
          className='gap-0'
        >
          {/* Header with spring-animated tab indicator */}
          <div className='flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2'>
            <TabsList variant='line' className='h-8 gap-1'>
              {PROTOCOL_SNIPPETS.map((item) => {
                const isActive = item.id === activeProtocol
                return (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className='relative rounded-md px-3 text-xs text-slate-300 after:hidden data-active:text-white'
                  >
                    {isActive && (
                      <motion.span
                        layoutId='quickstart-protocol-pill'
                        transition={MOTION_TRANSITION.spring}
                        className='absolute inset-0 -z-10 rounded-md border border-orange-400/40 bg-white/[0.09]'
                      />
                    )}
                    <span className='relative z-10 flex items-center gap-1.5'>
                      <span
                        className='flex shrink-0 items-center'
                        aria-hidden='true'
                      >
                        {getLobeIcon(item.iconKey, 13)}
                      </span>
                      <span>{item.label}</span>
                    </span>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <CopyButton
              value={currentCode}
              size='sm'
              variant='ghost'
              className='h-7 gap-1.5 px-2 text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white'
              iconClassName='size-3.5'
              aria-label={t('Copy code')}
            >
              <span>{t('Copy')}</span>
            </CopyButton>
          </div>

          {/* Live Supernova BOOM Core routing visualizer */}
          <div className='flex items-center justify-between gap-1.5 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-xs'>
            <div className='flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-300'>
              <Terminal className='size-3' aria-hidden='true' />
              <span>SDK</span>
            </div>

            <PlasmaArrowSvg />

            {/* Interactive BOOM Supernova Core */}
            <div
              onMouseEnter={() => setBurstCount((prev) => prev + 1)}
              className='relative flex items-center gap-1.5 rounded-md border border-orange-400/50 bg-linear-to-r from-amber-500/20 via-orange-500/20 to-fuchsia-500/20 px-2.5 py-1 font-mono text-[11px] font-extrabold tracking-wider text-amber-200 shadow-[0_0_24px_-4px_rgba(249,115,22,0.65)]'
            >
              <BoomShockwaveBurst burstKey={burstCount} size='sm' />
              <BoomEmblem className='size-3.5' spinning />
              <span>BOOM</span>
            </div>

            <PlasmaArrowSvg cyan />

            <div className='min-w-0 shrink'>
              <AnimatePresence mode='wait' initial={false}>
                <motion.div
                  key={currentSnippet.id}
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.92 }}
                  transition={MOTION_TRANSITION.fast}
                  className='flex items-center gap-1.5 rounded-md border border-sky-400/25 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] font-medium text-slate-100'
                >
                  <span
                    className='flex shrink-0 items-center'
                    aria-hidden='true'
                  >
                    {getLobeIcon(currentSnippet.iconKey, 13)}
                  </span>
                  <span className='truncate'>{currentSnippet.modelName}</span>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {PROTOCOL_SNIPPETS.map((item) => {
            const code = item.buildCurl(baseUrl)
            return (
              <TabsContent key={item.id} value={item.id} className='mt-0'>
                <div className='flex items-center justify-between gap-2 border-b border-white/8 px-4 py-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <Badge
                      variant='secondary'
                      className='rounded bg-orange-500/20 px-1.5 font-mono text-[10px] font-semibold text-amber-200'
                    >
                      POST
                    </Badge>
                    <code className='truncate font-mono text-xs text-slate-300'>
                      {item.endpoint}
                    </code>
                  </div>
                  <span className='flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-emerald-300/90 uppercase'>
                    <span className='size-1.5 animate-pulse rounded-full bg-emerald-400' />
                    200 OK
                  </span>
                </div>

                <motion.pre
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={MOTION_TRANSITION.fast}
                  className='overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100 sm:p-5 sm:text-[12.5px]'
                >
                  <code>{code}</code>
                </motion.pre>
              </TabsContent>
            )
          })}
        </Tabs>

        {/* Live streamed SSE output preview */}
        <div className='flex flex-col gap-1 border-t border-white/10 bg-white/[0.025] px-4 py-2.5'>
          <div className='flex items-center gap-2 overflow-hidden font-mono text-[11px]'>
            <span className='shrink-0 font-semibold text-amber-300'>SSE ▸</span>
            <span className='truncate text-sky-200/90'>
              {previewText}
              {typedChars < currentSnippet.streamPreview.length ? (
                <span
                  aria-hidden='true'
                  className='ml-0.5 inline-block h-3 w-1 bg-amber-400 align-middle'
                />
              ) : null}
            </span>
          </div>
          <p className='text-[11px] text-slate-400'>
            {t(
              'Switch between providers by changing the model name. Your client code stays the same.'
            )}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
