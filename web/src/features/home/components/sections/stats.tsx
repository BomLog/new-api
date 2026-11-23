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
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { BoomEmblem, BoomShockwaveBurst } from '../boom-brand-mark'

interface StatsProps {
  className?: string
}

interface StatItem {
  id: string
  value: number
  suffix: string
  label: string
}

interface AnimatedStatPodProps {
  item: StatItem
  index: number
  locale: string | undefined
}

function AnimatedStatPod(props: AnimatedStatPodProps) {
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimatedRef = useRef(false)
  const [burstKey, setBurstKey] = useState<number>(0)
  const [displayValue, setDisplayValue] = useState<number>(() =>
    typeof IntersectionObserver === 'undefined' ? props.item.value : 0
  )

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setDisplayValue(props.item.value)
      return
    }

    const element = ref.current
    if (!element) return

    let frameId = 0
    const durationMs = 1050

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasAnimatedRef.current) {
          hasAnimatedRef.current = true
          const startTime = performance.now()
          const tick = (now: number) => {
            const progress = Math.min((now - startTime) / durationMs, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplayValue(Math.round(eased * props.item.value))
            if (progress < 1) {
              frameId = requestAnimationFrame(tick)
            } else {
              setBurstKey((prev) => prev + 1)
            }
          }
          frameId = requestAnimationFrame(tick)
          observer.unobserve(element)
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [props.item.value])

  return (
    <motion.div
      ref={ref}
      onMouseEnter={() => setBurstKey((prev) => prev + 1)}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{
        duration: 0.45,
        delay: props.index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className='group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f1d]/85 p-4 transition-colors duration-300 hover:border-orange-400/45 sm:p-5'
    >
      {/* Top cosmic supernova plasma bar */}
      <motion.span
        aria-hidden='true'
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{
          duration: 0.55,
          delay: props.index * 0.07,
          ease: [0.22, 1, 0.36, 1],
        }}
        className='absolute inset-x-0 top-0 h-0.5 origin-left bg-linear-to-r from-amber-300 via-rose-500 to-sky-400 opacity-75 transition-opacity group-hover:opacity-100'
      />

      <div className='flex items-start justify-between gap-2'>
        <span className='relative inline-flex items-baseline text-2xl font-semibold tracking-tight text-white tabular-nums sm:text-3xl'>
          <BoomShockwaveBurst burstKey={burstKey} size='sm' />
          <span>{formatNumber(displayValue, props.locale)}</span>
          <span className='ml-0.5 text-amber-300'>{props.item.suffix}</span>
        </span>
        <BoomEmblem className='size-3.5 opacity-45 transition-transform duration-300 group-hover:scale-125 group-hover:rotate-45 group-hover:opacity-100' />
      </div>

      <span className='mt-1.5 text-xs text-slate-400 sm:text-sm'>
        {props.item.label}
      </span>
    </motion.div>
  )
}

export function Stats(props: StatsProps) {
  const { i18n, t } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const stats: StatItem[] = [
    {
      id: 'upstream',
      value: 50,
      suffix: '+',
      label: t('upstream services integrated'),
    },
    {
      id: 'billing',
      value: 100,
      suffix: '+',
      label: t('model billing support'),
    },
    { id: 'routes', value: 50, suffix: '+', label: t('compatible API routes') },
    {
      id: 'scheduling',
      value: 10,
      suffix: '+',
      label: t('scheduling controls'),
    },
  ]

  return (
    <section
      className={cn(
        'border-y border-white/10 bg-white/[0.02] px-6 py-8 md:py-10',
        props.className
      )}
    >
      <div className='mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-4 md:gap-5'>
        {stats.map((item, idx) => (
          <AnimatedStatPod
            key={item.id}
            item={item}
            index={idx}
            locale={locale}
          />
        ))}
      </div>
    </section>
  )
}
