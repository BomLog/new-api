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
import { cn } from '@/lib/utils'

const STAR_LAYER_A = [
  { id: 'a1', x: 7, y: 9, r: 1.1 },
  { id: 'a2', x: 18, y: 24, r: 0.9 },
  { id: 'a3', x: 31, y: 12, r: 1.3 },
  { id: 'a4', x: 44, y: 29, r: 0.8 },
  { id: 'a5', x: 58, y: 8, r: 1.2 },
  { id: 'a6', x: 72, y: 19, r: 1.0 },
  { id: 'a7', x: 86, y: 11, r: 1.4 },
  { id: 'a8', x: 93, y: 28, r: 0.9 },
  { id: 'a9', x: 12, y: 54, r: 1.1 },
  { id: 'a10', x: 39, y: 61, r: 0.9 },
  { id: 'a11', x: 67, y: 52, r: 1.2 },
  { id: 'a12', x: 89, y: 66, r: 1.0 },
  { id: 'a13', x: 22, y: 86, r: 1.3 },
  { id: 'a14', x: 53, y: 88, r: 0.9 },
  { id: 'a15', x: 79, y: 83, r: 1.1 },
] as const

const STAR_LAYER_B = [
  { id: 'b1', x: 4, y: 36, r: 0.9 },
  { id: 'b2', x: 25, y: 18, r: 1.2 },
  { id: 'b3', x: 49, y: 15, r: 0.8 },
  { id: 'b4', x: 64, y: 31, r: 1.3 },
  { id: 'b5', x: 77, y: 7, r: 0.9 },
  { id: 'b6', x: 95, y: 44, r: 1.1 },
  { id: 'b7', x: 16, y: 71, r: 1.0 },
  { id: 'b8', x: 47, y: 74, r: 1.2 },
  { id: 'b9', x: 71, y: 69, r: 0.8 },
  { id: 'b10', x: 84, y: 92, r: 1.3 },
  { id: 'b11', x: 34, y: 94, r: 0.9 },
] as const

const STAR_LAYER_C = [
  { id: 'c1', x: 11, y: 15, r: 1.6, fill: '#fde68a' },
  { id: 'c2', x: 38, y: 22, r: 1.5, fill: '#7dd3fc' },
  { id: 'c3', x: 69, y: 14, r: 1.7, fill: '#fda4af' },
  { id: 'c4', x: 82, y: 37, r: 1.5, fill: '#fb923c' },
  { id: 'c5', x: 27, y: 63, r: 1.6, fill: '#c4b5fd' },
  { id: 'c6', x: 61, y: 79, r: 1.5, fill: '#fde68a' },
  { id: 'c7', x: 91, y: 77, r: 1.6, fill: '#7dd3fc' },
] as const

const METEORS = [
  {
    id: 'm1',
    top: '8%',
    left: '72%',
    delay: '0s',
    duration: '6.2s',
    cyan: false,
  },
  {
    id: 'm2',
    top: '22%',
    left: '92%',
    delay: '2.1s',
    duration: '7.4s',
    cyan: true,
  },
  {
    id: 'm3',
    top: '48%',
    left: '84%',
    delay: '3.9s',
    duration: '6.8s',
    cyan: false,
  },
  {
    id: 'm4',
    top: '68%',
    left: '66%',
    delay: '5.2s',
    duration: '8.1s',
    cyan: true,
  },
] as const

interface CosmicSupernovaBackdropProps {
  className?: string
}

/**
 * Pure GPU-composited cosmic starfield + diagonal shooting meteors.
 * Uses a single static SVG + 4 CSS-only meteor streaks for near-zero CPU cost.
 */
export function CosmicSupernovaBackdrop(props: CosmicSupernovaBackdropProps) {
  return (
    <div
      aria-hidden='true'
      className={cn(
        'pointer-events-none fixed inset-0 -z-10 overflow-hidden contain-[layout_paint]',
        props.className
      )}
    >
      {/* Single lightweight SVG starfield (only 3 opacity-animated groups) */}
      <svg
        viewBox='0 0 100 100'
        preserveAspectRatio='none'
        className='size-full opacity-75'
      >
        <g className='boom-star-layer-a' fill='#e2e8f0'>
          {STAR_LAYER_A.map((star) => (
            <circle key={star.id} cx={star.x} cy={star.y} r={star.r * 0.14} />
          ))}
        </g>
        <g className='boom-star-layer-b' fill='#cbd5e1'>
          {STAR_LAYER_B.map((star) => (
            <circle key={star.id} cx={star.x} cy={star.y} r={star.r * 0.13} />
          ))}
        </g>
        <g className='boom-star-layer-c'>
          {STAR_LAYER_C.map((star) => (
            <circle
              key={star.id}
              cx={star.x}
              cy={star.y}
              r={star.r * 0.16}
              fill={star.fill}
            />
          ))}
        </g>
      </svg>

      {/* Diagonal shooting cosmic meteors (pure CSS transform) */}
      {METEORS.map((meteor) => (
        <span
          key={meteor.id}
          style={{
            top: meteor.top,
            left: meteor.left,
            animationDelay: meteor.delay,
            animationDuration: meteor.duration,
          }}
          className={cn(
            'boom-meteor absolute opacity-0',
            meteor.cyan && 'boom-meteor-cyan'
          )}
        />
      ))}
    </div>
  )
}
