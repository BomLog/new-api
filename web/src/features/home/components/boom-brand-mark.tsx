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
import { AnimatePresence, motion } from 'motion/react'
import { useId } from 'react'

import { cn } from '@/lib/utils'

interface BoomEmblemProps {
  className?: string
  spinning?: boolean
}

const SPARK_RAYS = [
  { id: 'r0', angleDeg: 0, distance: 44, tone: 'amber' },
  { id: 'r22', angleDeg: 22.5, distance: 30, tone: 'cyan' },
  { id: 'r45', angleDeg: 45, distance: 48, tone: 'rose' },
  { id: 'r67', angleDeg: 67.5, distance: 32, tone: 'amber' },
  { id: 'r90', angleDeg: 90, distance: 42, tone: 'violet' },
  { id: 'r112', angleDeg: 112.5, distance: 28, tone: 'amber' },
  { id: 'r135', angleDeg: 135, distance: 46, tone: 'rose' },
  { id: 'r157', angleDeg: 157.5, distance: 30, tone: 'cyan' },
  { id: 'r180', angleDeg: 180, distance: 48, tone: 'amber' },
  { id: 'r202', angleDeg: 202.5, distance: 30, tone: 'violet' },
  { id: 'r225', angleDeg: 225, distance: 44, tone: 'rose' },
  { id: 'r247', angleDeg: 247.5, distance: 32, tone: 'cyan' },
  { id: 'r270', angleDeg: 270, distance: 42, tone: 'amber' },
  { id: 'r292', angleDeg: 292.5, distance: 28, tone: 'rose' },
  { id: 'r315', angleDeg: 315, distance: 48, tone: 'violet' },
  { id: 'r337', angleDeg: 337.5, distance: 30, tone: 'amber' },
] as const

const SPARK_TONE_CLASSES: Record<(typeof SPARK_RAYS)[number]['tone'], string> =
  {
    amber: 'bg-linear-to-r from-amber-200 via-orange-400 to-orange-600',
    rose: 'bg-linear-to-r from-rose-200 via-rose-500 to-fuchsia-600',
    violet: 'bg-linear-to-r from-violet-200 via-purple-400 to-fuchsia-500',
    cyan: 'bg-linear-to-r from-sky-200 via-cyan-400 to-indigo-500',
  }

/**
 * Geometric 12-point supersonic supernova prism emblem for BOOM identity.
 */
export function BoomEmblem(props: BoomEmblemProps) {
  const gradientId = useId()

  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 32 32'
      fill='none'
      className={cn(
        'size-4 shrink-0',
        props.spinning && 'boom-spin-slow',
        props.className
      )}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1='2'
          y1='2'
          x2='30'
          y2='30'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='0%' stopColor='#fde68a' />
          <stop offset='42%' stopColor='#fb923c' />
          <stop offset='76%' stopColor='#f43f5e' />
          <stop offset='100%' stopColor='#a855f7' />
        </linearGradient>
      </defs>
      <path
        d='M16 1L18.6 9.8L26.6 5.4L22.2 13.4L31 16L22.2 18.6L26.6 26.6L18.6 22.2L16 31L13.4 22.2L5.4 26.6L9.8 18.6L1 16L9.8 13.4L5.4 5.4L13.4 9.8L16 1Z'
        fill={`url(#${gradientId})`}
      />
      <path
        d='M16 9.2L18.5 13.5L22.8 16L18.5 18.5L16 22.8L13.5 18.5L9.2 16L13.5 13.5L16 9.2Z'
        fill='#ffffff'
        fillOpacity='0.95'
      />
    </svg>
  )
}

interface BoomWordmarkBadgeProps {
  className?: string
  compact?: boolean
}

/**
 * High-contrast cosmic BOOM wordmark pill with supersonic starburst icon.
 */
export function BoomWordmarkBadge(props: BoomWordmarkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-orange-400/45 bg-linear-to-r from-amber-500/20 via-orange-500/20 to-fuchsia-500/20 font-mono font-extrabold tracking-[0.15em] text-amber-200 uppercase shadow-[0_0_16px_-4px_rgba(249,115,22,0.55)]',
        props.compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        props.className
      )}
    >
      <BoomEmblem className={props.compact ? 'size-3' : 'size-3.5'} spinning />
      <span>BOOM</span>
    </span>
  )
}

interface BoomShockwaveBurstProps {
  burstKey: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Multi-spectrum cosmic supernova detonation burst:
 * White-hot core flash + dual chromatic shockwave rings + 16 directional spark streaks.
 * Uses only GPU-composited `transform` and `opacity` for 60/120fps smoothness.
 */
export function BoomShockwaveBurst(props: BoomShockwaveBurstProps) {
  if (props.burstKey <= 0) {
    return null
  }

  let scaleMultiplier = 1
  if (props.size === 'sm') {
    scaleMultiplier = 0.7
  } else if (props.size === 'lg') {
    scaleMultiplier = 2.0
  }

  return (
    <span
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible',
        props.className
      )}
    >
      <AnimatePresence mode='popLayout'>
        {/* White-hot singularity core flash */}
        <motion.span
          key={`flash-${props.burstKey}`}
          initial={{ opacity: 0.95, scale: 0.15 }}
          animate={{ opacity: 0, scale: 1.45 * scaleMultiplier }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className='absolute size-10 rounded-full bg-radial from-white via-amber-300/80 to-transparent'
        />

        {/* Primary molten orange-gold supersonic shockwave */}
        <motion.span
          key={`wave-primary-${props.burstKey}`}
          initial={{ opacity: 0.92, scale: 0.2 }}
          animate={{ opacity: 0, scale: 2.65 * scaleMultiplier }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className='absolute size-12 rounded-full border-2 border-orange-400/90'
        />

        {/* Secondary cosmic cyan-violet plasma ripple */}
        <motion.span
          key={`wave-secondary-${props.burstKey}`}
          initial={{ opacity: 0.8, scale: 0.15 }}
          animate={{ opacity: 0, scale: 2.05 * scaleMultiplier }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.62, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className='absolute size-11 rounded-full border border-sky-400/85'
        />

        {/* 16 directional plasma spark streaks */}
        {SPARK_RAYS.map((ray) => {
          const rad = (ray.angleDeg * Math.PI) / 180
          const tx = Math.cos(rad) * ray.distance * scaleMultiplier
          const ty = Math.sin(rad) * ray.distance * scaleMultiplier
          return (
            <motion.span
              key={`spark-${props.burstKey}-${ray.id}`}
              initial={{
                opacity: 1,
                x: 0,
                y: 0,
                rotate: ray.angleDeg,
                scaleX: 0.4,
              }}
              animate={{
                opacity: 0,
                x: tx,
                y: ty,
                rotate: ray.angleDeg,
                scaleX: 1.5,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'absolute h-[2px] w-3 rounded-full',
                SPARK_TONE_CLASSES[ray.tone]
              )}
            />
          )
        })}
      </AnimatePresence>
    </span>
  )
}
