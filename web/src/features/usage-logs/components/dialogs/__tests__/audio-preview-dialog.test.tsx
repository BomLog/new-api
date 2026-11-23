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
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { AudioPreviewDialog } from '../audio-preview-dialog'

afterEach(() => vi.restoreAllMocks())

describe('AudioPreviewDialog external URL safety', () => {
  test('blocks non-http audio_url schemes when opening in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(
      <AudioPreviewDialog
        open
        onOpenChange={() => {}}
        clips={[{ id: '1', title: 'Evil Clip', audio_url: 'javascript:alert(1)' }]}
      />
    )

    const audio = document.body.querySelector('audio')
    if (audio) {
      fireEvent.error(audio)
    }

    const openBtn = screen.queryByRole('button', { name: /Open in new tab/i })
    if (openBtn) {
      fireEvent.click(openBtn)
    }

    expect(openSpy).not.toHaveBeenCalled()
  })

  test('opens https audio_url with noopener,noreferrer', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(
      <AudioPreviewDialog
        open
        onOpenChange={() => {}}
        clips={[
          {
            id: '2',
            title: 'Valid Clip',
            audio_url: 'https://cdn.example.com/clip.mp3',
          },
        ]}
      />
    )

    const audio = document.body.querySelector('audio')
    if (!audio) {
      throw new Error('expected audio element to be rendered')
    }
    fireEvent.error(audio)

    const openBtn = screen.getByRole('button', { name: /Open in new tab/i })
    fireEvent.click(openBtn)

    expect(openSpy).toHaveBeenCalledWith(
      'https://cdn.example.com/clip.mp3',
      '_blank',
      'noopener,noreferrer'
    )
  })
})
