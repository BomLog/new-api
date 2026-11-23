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
import { ArrowRight } from 'lucide-react'
import { motion, useMotionTemplate, useMotionValue } from 'motion/react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  BoomEmblem,
  BoomShockwaveBurst,
  BoomWordmarkBadge,
} from '../boom-brand-mark'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()
  const [ctaBurstKey, setCtaBurstKey] = useState<number>(0)
  const mouseX = useMotionValue(-999)
  const mouseY = useMotionValue(-999)

  const ctaSpotlight = useMotionTemplate`radial-gradient(420px circle at ${mouseX}px ${mouseY}px, rgba(249, 115, 22, 0.2), rgba(168, 85, 247, 0.08) 45%, transparent 75%)`

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    mouseX.set(event.clientX - rect.left)
    mouseY.set(event.clientY - rect.top)
  }

  const handleMouseLeave = () => {
    mouseX.set(-999)
    mouseY.set(-999)
  }

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className={cn('px-6 py-16 md:py-20', props.className)}>
      <div className='relative mx-auto max-w-6xl rounded-2xl p-px'>
        <div
          aria-hidden='true'
          className='boom-flow-border pointer-events-none absolute inset-0 rounded-2xl opacity-75'
        />

        <motion.div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className='relative flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-white/12 bg-[#0a0e1c]/95 px-6 py-10 md:flex-row md:items-center md:px-10 md:py-12'
        >
          {/* Half-submerged cosmic supernova singularity */}
          <div
            aria-hidden='true'
            className='home-arch-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_65%)] opacity-50'
          />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute -right-14 -bottom-14 flex items-center justify-center'
          >
            <div className='boom-supernova-rays boom-spin-supernova absolute size-80 rounded-full opacity-75' />
            <span className='boom-shockwave-ring absolute size-44 rounded-full border border-orange-400/35' />
            <span
              className='boom-shockwave-ring absolute size-44 rounded-full border border-sky-400/25'
              style={{ animationDelay: '1.6s' }}
            />
            <BoomEmblem className='size-32 opacity-20' spinning />
          </div>

          <motion.div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0'
            style={{ background: ctaSpotlight }}
          />

          <div className='relative z-10 max-w-xl'>
            <BoomWordmarkBadge compact className='mb-3' />
            <h2 className='text-xl leading-tight font-semibold tracking-tight text-white md:text-2xl'>
              {t('Ready to simplify')} {t('your AI integration?')}
            </h2>
            <p className='mt-2 text-sm leading-relaxed text-slate-300/80'>
              {t(
                'Deploy your own gateway and start routing requests through your configured upstream services.'
              )}
            </p>
          </div>

          <div className='relative z-10 flex shrink-0 flex-wrap items-center gap-3'>
            <div className='relative'>
              <BoomShockwaveBurst burstKey={ctaBurstKey} size='md' />
              <Button
                onMouseEnter={() => setCtaBurstKey((prev) => prev + 1)}
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
            </div>
            <Button
              variant='outline'
              className='h-10 rounded-lg border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-100 hover:border-white/30 hover:bg-white/[0.09]'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
