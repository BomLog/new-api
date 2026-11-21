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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

import { HeroTerminalDemo } from '../hero-terminal-demo'

export function ApiPreview() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-6 py-24 md:py-32'>
      <div className='mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12'>
        <AnimateInView className='lg:col-span-5'>
          <p className='mb-3 font-mono text-xs font-medium tracking-widest text-sky-300 uppercase'>
            {t('Live API Preview')}
          </p>
          <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
            {t('One endpoint,')}
            <br />
            <span className='space-gradient-text'>{t('every model')}</span>
          </h2>
          <p className='text-muted-foreground mt-5 max-w-md text-sm leading-relaxed md:text-base'>
            {t(
              'Switch between providers by changing the model name. Your client code stays the same.'
            )}
          </p>
        </AnimateInView>
        <AnimateInView
          animation='fade-left'
          delay={120}
          className='lg:col-span-7'
        >
          <HeroTerminalDemo />
        </AnimateInView>
      </div>
    </section>
  )
}
