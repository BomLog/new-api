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
import { BarChart3, Settings, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { BoomEmblem, BoomShockwaveBurst } from '../boom-brand-mark'

interface HowItWorksProps {
  className?: string
}

export function HowItWorks(props: HowItWorksProps) {
  const { t } = useTranslation()
  const [activeStep, setActiveStep] = useState<number>(0)
  const [burstTick, setBurstTick] = useState<number>(0)
  const [isHovered, setIsHovered] = useState<boolean>(false)

  const steps = [
    {
      num: '01',
      title: t('Configure'),
      desc: t(
        'Add your API keys, set up channels and configure access permissions'
      ),
      icon: Settings,
    },
    {
      num: '02',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: Zap,
    },
    {
      num: '03',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: BarChart3,
    },
  ]

  useEffect(() => {
    if (isHovered) return

    const timer = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3)
      setBurstTick((prev) => prev + 1)
    }, 2800)

    return () => window.clearInterval(timer)
  }, [isHovered])

  return (
    <section
      className={cn(
        'border-t border-white/10 px-6 py-16 md:py-24',
        props.className
      )}
    >
      <div className='mx-auto max-w-6xl'>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className='mb-10 max-w-xl'
        >
          <p className='mb-2 flex items-center gap-2 text-xs font-medium tracking-wider text-slate-400 uppercase'>
            <BoomEmblem className='size-3.5' spinning />
            <span>{t('How It Works')}</span>
          </p>
          <h2 className='text-2xl leading-tight font-semibold tracking-tight text-white md:text-3xl'>
            {t('Three steps to get started')}
          </h2>
        </motion.div>

        <ol
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className='grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8'
        >
          {steps.map((step, idx) => {
            const Icon = step.icon
            const isActive = activeStep === idx
            return (
              <motion.li
                key={step.num}
                onMouseEnter={() => {
                  setActiveStep(idx)
                  setBurstTick((prev) => prev + 1)
                }}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  duration: 0.45,
                  delay: idx * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cn(
                  'relative flex flex-col rounded-xl border p-6 transition-all duration-300',
                  isActive
                    ? 'border-orange-400/50 bg-[#0d1224]/95 shadow-[0_18px_48px_-20px_rgba(249,115,22,0.38)]'
                    : 'border-white/10 bg-[#080b16]/80 hover:border-white/20'
                )}
              >
                {/* Animated supernova plasma progress beam */}
                <div
                  aria-hidden='true'
                  className='relative mb-5 h-0.5 w-full overflow-hidden rounded-full bg-white/10'
                >
                  {isActive && (
                    <motion.div
                      layoutId='how-it-works-active-beam'
                      transition={MOTION_TRANSITION.spring}
                      className='absolute inset-0 rounded-full bg-linear-to-r from-amber-300 via-rose-500 to-sky-400'
                    />
                  )}
                </div>

                <div className='flex items-center justify-between'>
                  <span
                    className={cn(
                      'font-mono text-xs font-bold transition-colors duration-300',
                      isActive ? 'text-amber-300' : 'text-slate-500'
                    )}
                  >
                    {step.num}
                  </span>
                  <div
                    className={cn(
                      'relative flex size-8 items-center justify-center rounded-lg border transition-colors duration-300',
                      isActive
                        ? 'border-orange-400/50 bg-orange-500/15 text-amber-200'
                        : 'border-white/10 bg-white/[0.04] text-slate-400'
                    )}
                  >
                    {isActive && (
                      <BoomShockwaveBurst burstKey={burstTick} size='sm' />
                    )}
                    <Icon aria-hidden='true' className='size-4' />
                  </div>
                </div>

                <h3 className='mt-3 text-base font-semibold text-white'>
                  {step.title}
                </h3>
                <p className='mt-1.5 text-sm leading-relaxed text-slate-400'>
                  {step.desc}
                </p>
              </motion.li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
