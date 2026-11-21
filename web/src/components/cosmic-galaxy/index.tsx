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
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

import type {
  CosmicColorMode,
  CosmicGalaxyController,
  CosmicSceneVariant,
} from './scene'

export interface CosmicGalaxySceneProps {
  className?: string
  variant?: CosmicSceneVariant
  colorMode?: CosmicColorMode
}

/**
 * Decorative multi-galaxy interconnected WebGL cosmic scene.
 * three.js is loaded lazily so it stays out of the initial main bundle;
 * rendering pauses off-screen and on hidden tabs, and reduced-motion users
 * receive a single settled frame.
 */
export function CosmicGalaxyScene(props: CosmicGalaxySceneProps) {
  const variant = props.variant ?? 'hero'
  const colorMode = props.colorMode ?? 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<CosmicGalaxyController | null>(null)
  const colorModeRef = useRef<CosmicColorMode>(colorMode)
  colorModeRef.current = colorMode

  useEffect(() => {
    controllerRef.current?.setColorMode(colorMode)
  }, [colorMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let cleanup: (() => void) | undefined

    void import('./scene').then(({ createCosmicGalaxyScene }) => {
      if (disposed) return
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches
      const lowPower =
        variant === 'ambient' ||
        window.matchMedia('(max-width: 768px)').matches ||
        (navigator.hardwareConcurrency ?? 8) <= 4
      const galaxy = createCosmicGalaxyScene(canvas, {
        lowPower,
        reducedMotion,
        variant,
        colorMode: colorModeRef.current,
      })
      if (!galaxy) return
      controllerRef.current = galaxy

      let visible = true
      const sync = () => {
        if (!reducedMotion && visible && !document.hidden) galaxy.start()
        else galaxy.stop()
      }
      const resizeObserver = new ResizeObserver(([entry]) => {
        galaxy.setSize(entry.contentRect.width, entry.contentRect.height)
      })
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        sync()
      })
      const handlePointer = (event: PointerEvent) => {
        galaxy.setPointer(
          (event.clientX / window.innerWidth) * 2 - 1,
          -((event.clientY / window.innerHeight) * 2 - 1)
        )
      }

      const rect = canvas.getBoundingClientRect()
      galaxy.setSize(rect.width, rect.height)
      resizeObserver.observe(canvas)
      intersection.observe(canvas)
      document.addEventListener('visibilitychange', sync)
      if (!reducedMotion) {
        window.addEventListener('pointermove', handlePointer, { passive: true })
      }
      sync()

      cleanup = () => {
        resizeObserver.disconnect()
        intersection.disconnect()
        document.removeEventListener('visibilitychange', sync)
        window.removeEventListener('pointermove', handlePointer)
        galaxy.dispose()
        controllerRef.current = null
      }
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [variant])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      className={cn('pointer-events-none block h-full w-full', props.className)}
    />
  )
}

/**
 * Global ambient multi-galaxy backdrop active whenever the user selects the
 * `galaxy` color preset. Skips mounting on `/` because the landing page renders
 * its own full hero scene.
 */
export function CosmicThemeBackdrop() {
  const { customization } = useThemeCustomization()
  const { resolvedTheme } = useTheme()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (customization.preset !== 'galaxy' || pathname === '/') {
    return null
  }

  return (
    <div
      aria-hidden='true'
      className='pointer-events-none fixed inset-0 z-0 overflow-hidden'
    >
      <CosmicGalaxyScene
        variant='ambient'
        colorMode={resolvedTheme}
        className={resolvedTheme === 'dark' ? 'opacity-65' : 'opacity-45'}
      />
    </div>
  )
}
