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
import {
  Code,
  DollarSign,
  Gauge,
  Globe,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { motion, useMotionTemplate, useMotionValue } from 'motion/react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  BoomEmblem,
  BoomShockwaveBurst,
  BoomWordmarkBadge,
} from '../boom-brand-mark'

interface FeaturesProps {
  className?: string
}

interface FeatureItem {
  id: string
  title: string
  desc: string
  icon: LucideIcon
}

interface FeatureBurstCardProps {
  item: FeatureItem
  index: number
}

function FeatureBurstCard(props: FeatureBurstCardProps) {
  const [burstKey, setBurstKey] = useState<number>(0)
  const Icon = props.item.icon

  return (
    <motion.div
      onMouseEnter={() => setBurstKey((prev) => prev + 1)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        duration: 0.45,
        delay: props.index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className='group relative flex flex-col overflow-hidden bg-[#090d1a]/92 p-6 transition-colors duration-300 hover:bg-[#0e1427]/95 md:p-7'
    >
      <div className='mb-4 flex items-center justify-between'>
        <div className='relative flex size-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] text-slate-100 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-orange-400/50 group-hover:bg-orange-500/15 group-hover:text-amber-200'>
          <BoomShockwaveBurst burstKey={burstKey} size='sm' />
          <Icon className='size-4' strokeWidth={1.75} aria-hidden='true' />
        </div>
        <BoomEmblem className='size-4 scale-75 opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:rotate-45 group-hover:opacity-95' />
      </div>

      <h3 className='text-sm font-semibold text-white'>{props.item.title}</h3>
      <p className='mt-1.5 text-sm leading-relaxed text-slate-400'>
        {props.item.desc}
      </p>
    </motion.div>
  )
}

export function Features(props: FeaturesProps) {
  const { t } = useTranslation()
  const mouseX = useMotionValue(-999)
  const mouseY = useMotionValue(-999)

  const spotlightOverlay = useMotionTemplate`radial-gradient(460px circle at ${mouseX}px ${mouseY}px, rgba(249, 115, 22, 0.18), rgba(168, 85, 247, 0.09) 45%, transparent 76%)`

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    mouseX.set(event.clientX - rect.left)
    mouseY.set(event.clientY - rect.top)
  }

  const handleMouseLeave = () => {
    mouseX.set(-999)
    mouseY.set(-999)
  }

  const features: FeatureItem[] = [
    {
      id: 'developer',
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
      icon: Code,
    },
    {
      id: 'performance',
      title: t('High Performance'),
      desc: t('Support for high concurrency with automatic load balancing'),
      icon: Gauge,
    },
    {
      id: 'billing',
      title: t('Transparent Billing'),
      desc: t('Pay-as-you-go with real-time usage monitoring'),
      icon: DollarSign,
    },
    {
      id: 'secure',
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
      icon: Shield,
    },
    {
      id: 'team',
      title: t('Team Collaboration'),
      desc: t('Multi-user management with flexible permission allocation'),
      icon: Users,
    },
    {
      id: 'global',
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
      icon: Globe,
    },
  ]

  return (
    <section className={cn('px-6 py-16 md:py-24', props.className)}>
      <div className='mx-auto max-w-6xl'>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className='mb-10 max-w-xl'
        >
          <div className='mb-3 flex items-center gap-2.5'>
            <BoomWordmarkBadge compact />
            <span className='text-xs font-medium tracking-wider text-slate-400 uppercase'>
              {t('Core Features')}
            </span>
          </div>
          <h2 className='text-2xl leading-tight font-semibold tracking-tight text-white md:text-3xl'>
            {t('Built for developers,')} {t('designed for scale')}
          </h2>
        </motion.div>

        {/* Cursor-tracking cosmic supernova spotlight bento grid */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className='relative grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/12 bg-white/10 sm:grid-cols-2 lg:grid-cols-3'
        >
          <motion.div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 z-10'
            style={{ background: spotlightOverlay }}
          />

          {features.map((item, idx) => (
            <FeatureBurstCard key={item.id} item={item} index={idx} />
          ))}
        </div>
      </div>
    </section>
  )
}
