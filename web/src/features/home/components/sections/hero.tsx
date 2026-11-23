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
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from 'motion/react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { CustomButtonsBar } from '@/components/custom-nav-buttons'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  BoomEmblem,
  BoomShockwaveBurst,
  BoomWordmarkBadge,
} from '../boom-brand-mark'
import { QuickstartCodeCard } from '../quickstart-code-card'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

interface EcosystemItem {
  name: string
  iconKey?: string
  href?: string
}

const ECOSYSTEM_ROW_ONE: EcosystemItem[] = [
  { name: 'OpenAI', iconKey: 'OpenAI' },
  { name: 'Claude', iconKey: 'Claude.Color' },
  { name: 'Gemini', iconKey: 'Gemini.Color' },
  { name: 'DeepSeek', iconKey: 'DeepSeek.Color' },
  { name: 'Qwen', iconKey: 'Qwen.Color' },
]

const ECOSYSTEM_ROW_TWO: EcosystemItem[] = [
  { name: 'Mistral', iconKey: 'Mistral.Color' },
  { name: 'Llama', iconKey: 'Meta.Color' },
  {
    name: 'Cherry Studio',
    iconKey: 'CherryStudio.Color',
    href: 'https://cherry-ai.com',
  },
  { name: 'CC Switch', href: 'https://ccswitch.io' },
]

const FLOATING_SPARKS = [
  { id: 'sp-1', left: '10%', top: '24%', delay: 0, duration: 4.0, cyan: false },
  {
    id: 'sp-2',
    left: '42%',
    top: '16%',
    delay: 1.0,
    duration: 5.0,
    cyan: true,
  },
  {
    id: 'sp-3',
    left: '56%',
    top: '76%',
    delay: 0.5,
    duration: 4.5,
    cyan: false,
  },
  {
    id: 'sp-4',
    left: '84%',
    top: '20%',
    delay: 1.6,
    duration: 3.8,
    cyan: true,
  },
  {
    id: 'sp-5',
    left: '78%',
    top: '82%',
    delay: 2.2,
    duration: 4.7,
    cyan: false,
  },
  {
    id: 'sp-6',
    left: '26%',
    top: '74%',
    delay: 0.9,
    duration: 5.2,
    cyan: true,
  },
] as const

const HERO_EASE = [0.22, 1, 0.36, 1] as const

function buildMarqueeTrack(items: EcosystemItem[]) {
  return [
    ...items.map((item) => ({
      ...item,
      trackKey: `${item.name}-primary`,
      isClone: false,
    })),
    ...items.map((item) => ({
      ...item,
      trackKey: `${item.name}-clone`,
      isClone: true,
    })),
  ]
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [heroBurstKey, setHeroBurstKey] = useState<number>(0)

  const pointerX = useMotionValue(420)
  const pointerY = useMotionValue(260)
  const smoothX = useSpring(pointerX, { damping: 32, stiffness: 220 })
  const smoothY = useSpring(pointerY, { damping: 32, stiffness: 220 })

  const gridMask = useMotionTemplate`radial-gradient(500px circle at ${smoothX}px ${smoothY}px, black 0%, transparent 75%)`
  const ambientGlow = useMotionTemplate`radial-gradient(560px circle at ${smoothX}px ${smoothY}px, rgba(249, 115, 22, 0.14), rgba(168, 85, 247, 0.06) 45%, transparent 72%)`

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointerX.set(event.clientX - rect.left)
    pointerY.set(event.clientY - rect.top)
  }

  const triggerBoomShockwave = () => {
    setHeroBurstKey((prev) => prev + 1)
  }

  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'

  const renderDocsButton = () => {
    const isExternal = docsUrl.startsWith('http')
    if (isExternal) {
      return (
        <Button
          variant='outline'
          className='h-10 rounded-lg border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-100 hover:border-white/30 hover:bg-white/[0.09]'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='size-4' aria-hidden='true' />
          <span>{t('Docs')}</span>
        </Button>
      )
    }
    return (
      <Button
        variant='outline'
        className='h-10 rounded-lg border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-100 hover:border-white/30 hover:bg-white/[0.09]'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='size-4' aria-hidden='true' />
        <span>{t('Docs')}</span>
      </Button>
    )
  }

  const getEntranceProps = (delay: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.52, delay, ease: HERO_EASE },
  })

  const rowOneItems = buildMarqueeTrack(ECOSYSTEM_ROW_ONE)
  const rowTwoItems = buildMarqueeTrack(ECOSYSTEM_ROW_TWO)

  const renderMarqueeItem = (item: {
    name: string
    iconKey?: string
    href?: string
    trackKey: string
    isClone: boolean
  }) => {
    const badgeContent = (
      <>
        {item.iconKey ? (
          <span className='flex shrink-0 items-center' aria-hidden='true'>
            {getLobeIcon(item.iconKey, 14)}
          </span>
        ) : null}
        <span>{item.name}</span>
      </>
    )

    if (item.href) {
      return (
        <a
          key={item.trackKey}
          href={item.href}
          target='_blank'
          rel='noopener noreferrer'
          aria-hidden={item.isClone || undefined}
          tabIndex={item.isClone ? -1 : undefined}
          className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300 transition-colors duration-200 hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white'
        >
          {badgeContent}
        </a>
      )
    }

    return (
      <span
        key={item.trackKey}
        aria-hidden={item.isClone || undefined}
        className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-orange-400/40'
      >
        {badgeContent}
      </span>
    )
  }

  return (
    <section
      onMouseMove={handleMouseMove}
      className={cn(
        'relative overflow-hidden px-6 pt-28 pb-16 md:pt-36 md:pb-24',
        props.className
      )}
    >
      {/* Supernova Big Bang singularity, rotating god-rays, accretion orbits & cursor grid */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 -z-10 contain-[layout_paint]'
      >
        <div className='home-arch-grid absolute inset-0 [mask-image:radial-gradient(ellipse_80%_65%_at_50%_40%,black_25%,transparent_86%)] opacity-65' />
        <motion.div
          className='home-arch-grid-bright absolute inset-0'
          style={{ WebkitMaskImage: gridMask, maskImage: gridMask }}
        />
        <motion.div
          className='absolute inset-0'
          style={{ background: ambientGlow }}
        />

        {/* Cosmic Supernova Big Bang Singularity behind right hero column */}
        <div className='absolute top-1/2 right-[6%] hidden -translate-y-1/2 lg:flex lg:items-center lg:justify-center'>
          <div className='boom-supernova-rays boom-spin-supernova absolute size-[34rem] rounded-full' />

          <div className='h-72 w-72 rounded-full bg-radial from-amber-400/24 via-rose-500/14 to-transparent' />

          {/* 3D tilted accretion disk orbital rings with satellites */}
          <div
            className='absolute size-[24rem]'
            style={{
              transform: 'perspective(900px) rotateX(68deg) rotateZ(-16deg)',
            }}
          >
            <div className='boom-spin-orbit relative size-full rounded-full border border-orange-400/35'>
              <span className='absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_#fbbf24]' />
              <span className='absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-rose-400 shadow-[0_0_10px_#fb7185]' />
            </div>
          </div>

          <div
            className='absolute size-[30rem]'
            style={{
              transform: 'perspective(900px) rotateX(72deg) rotateZ(18deg)',
            }}
          >
            <div className='boom-spin-orbit-reverse relative size-full rounded-full border border-sky-400/25'>
              <span className='absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_12px_#7dd3fc]' />
              <span className='absolute top-1/2 -left-1 size-1.5 -translate-y-1/2 rounded-full bg-purple-400 shadow-[0_0_10px_#c084fc]' />
            </div>
          </div>

          {/* 4 alternating molten & cosmic-cyan concentric shockwave rings */}
          <span className='boom-shockwave-ring absolute size-56 rounded-full border border-orange-400/35' />
          <span
            className='boom-shockwave-ring absolute size-56 rounded-full border border-sky-400/28'
            style={{ animationDelay: '0.9s' }}
          />
          <span
            className='boom-shockwave-ring absolute size-56 rounded-full border border-rose-400/28'
            style={{ animationDelay: '1.8s' }}
          />
          <span
            className='boom-shockwave-ring absolute size-56 rounded-full border border-violet-400/24'
            style={{ animationDelay: '2.7s' }}
          />
        </div>

        {/* Full-hero user-triggered Big Bang supersonic shockwaves */}
        {heroBurstKey > 0 && (
          <AnimatePresence mode='popLayout'>
            <motion.span
              key={`hero-mega-wave-${heroBurstKey}`}
              initial={{ opacity: 0.78, scale: 0.15 }}
              animate={{ opacity: 0, scale: 4.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
              className='absolute top-36 left-[18%] size-56 rounded-full border-2 border-orange-400/75'
            />
            <motion.span
              key={`hero-mega-cyan-${heroBurstKey}`}
              initial={{ opacity: 0.65, scale: 0.12 }}
              animate={{ opacity: 0, scale: 3.8 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.95,
                delay: 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className='absolute top-36 left-[18%] size-56 rounded-full border border-sky-400/70'
            />
          </AnimatePresence>
        )}

        {/* Rising cosmic ember & plasma sparks */}
        {FLOATING_SPARKS.map((spark) => (
          <motion.span
            key={spark.id}
            style={{ left: spark.left, top: spark.top }}
            animate={{
              y: [0, -32, 0],
              opacity: [0.22, 0.85, 0.22],
              scale: [0.85, 1.3, 0.85],
            }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
            className={cn(
              'absolute size-1.5 rounded-full',
              spark.cyan
                ? 'bg-linear-to-tr from-sky-300 to-violet-400'
                : 'bg-linear-to-tr from-amber-300 to-orange-500'
            )}
          />
        ))}
      </div>

      <div className='mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12'>
        {/* Left: BOOM brand crest, supernova headline & actions */}
        <div className='flex flex-col items-start text-left lg:col-span-6'>
          <motion.div {...getEntranceProps(0)} className='mb-5'>
            <button
              type='button'
              onClick={triggerBoomShockwave}
              aria-label={t('Trigger BOOM shockwave')}
              className='group relative inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] py-1 pr-3.5 pl-1.5 text-xs transition-all duration-200 hover:border-orange-400/55 hover:bg-white/[0.09] hover:shadow-[0_0_28px_-6px_rgba(249,115,22,0.55)]'
            >
              <BoomShockwaveBurst burstKey={heroBurstKey} size='md' />
              <BoomWordmarkBadge compact />
              <span className='font-medium text-slate-300 transition-colors group-hover:text-white'>
                {t('Explosive Throughput, Instant Routing')}
              </span>
            </button>
          </motion.div>

          <motion.h1
            {...getEntranceProps(0.06)}
            className='text-3xl leading-[1.14] font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.9rem]'
          >
            {t('Unified API Gateway for')}
            <br />
            <span className='inline-flex flex-wrap items-center gap-2.5'>
              <span className='boom-text-shimmer'>
                {t('Vast Range of AI Models')}
              </span>
              <BoomEmblem className='size-6 sm:size-7' spinning />
            </span>
          </motion.h1>

          <motion.p
            {...getEntranceProps(0.12)}
            className='mt-4 max-w-lg text-sm leading-relaxed text-slate-300/85 sm:text-base'
          >
            {t(
              'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
            )}
          </motion.p>

          <motion.div
            {...getEntranceProps(0.18)}
            className='mt-7 flex flex-wrap items-center gap-3'
          >
            {props.isAuthenticated ? (
              <>
                <Button
                  onMouseEnter={triggerBoomShockwave}
                  className='group relative h-10 overflow-hidden rounded-lg border border-orange-400/50 bg-linear-to-r from-amber-500 via-orange-500 to-rose-500 px-5 text-sm font-semibold text-white shadow-[0_0_28px_-6px_rgba(249,115,22,0.75)] hover:brightness-110'
                  render={<Link to='/dashboard' />}
                >
                  <span
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full'
                  />
                  <BoomEmblem className='mr-1 size-3.5' />
                  {t('Go to Dashboard')}
                  <ArrowRight
                    className='ml-1 size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                    aria-hidden='true'
                  />
                </Button>
                {renderDocsButton()}
              </>
            ) : (
              <>
                <Button
                  onMouseEnter={triggerBoomShockwave}
                  className='group relative h-10 overflow-hidden rounded-lg border border-orange-400/50 bg-linear-to-r from-amber-500 via-orange-500 to-rose-500 px-5 text-sm font-semibold text-white shadow-[0_0_28px_-6px_rgba(249,115,22,0.75)] hover:brightness-110'
                  render={<Link to='/sign-up' />}
                >
                  <span
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full'
                  />
                  <BoomEmblem className='mr-1 size-3.5' />
                  {t('Get Started')}
                  <ArrowRight
                    className='ml-1 size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                    aria-hidden='true'
                  />
                </Button>
                <Button
                  variant='outline'
                  className='h-10 rounded-lg border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-100 hover:border-white/30 hover:bg-white/[0.09]'
                  render={<Link to='/pricing' />}
                >
                  {t('View Pricing')}
                </Button>
                {renderDocsButton()}
              </>
            )}
          </motion.div>

          <motion.div {...getEntranceProps(0.22)} className='w-full'>
            <CustomButtonsBar
              placement='home'
              size='compact'
              className='mt-4'
            />
          </motion.div>

          {/* Dual-row opposing-velocity cosmic model & client marquee */}
          <motion.div
            {...getEntranceProps(0.26)}
            className='mt-9 w-full max-w-xl border-t border-white/10 pt-5'
          >
            <div className='mb-3 flex items-center justify-between'>
              <p className='text-xs font-medium text-slate-400'>
                {t('Multi-protocol Compatible')}
              </p>
              <span className='font-mono text-[10px] font-semibold tracking-widest text-amber-300/85 uppercase'>
                BOOM // COSMIC MESH
              </span>
            </div>

            <div className='fade-x relative space-y-2 overflow-hidden'>
              <div className='home-marquee-track gap-2.5'>
                {rowOneItems.map(renderMarqueeItem)}
              </div>
              <div className='home-marquee-track-reverse gap-2.5'>
                {rowTwoItems.map(renderMarqueeItem)}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right: 3D Tilted Supernova Quickstart & BOOM Core Card */}
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.62, delay: 0.14, ease: HERO_EASE }}
          className='lg:col-span-6'
        >
          <QuickstartCodeCard />
        </motion.div>
      </div>
    </section>
  )
}
