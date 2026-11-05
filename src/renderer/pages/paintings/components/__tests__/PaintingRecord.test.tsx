import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import type * as CherryStudioUi from '@cherrystudio/ui'
import en from '@renderer/i18n/locales/en-us.json'

import type { PaintingData } from '../../model/types/paintingData'

vi.mock('@cherrystudio/ui', async (importOriginal) => importOriginal<typeof CherryStudioUi>())
const { default: PaintingRecord } = await import('../PaintingRecord')
const i18n = createInstance()
await i18n.init({
  lng: 'en',
  keySeparator: false,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false }
})
const painting: PaintingData = {
  id: 'child',
  providerId: 'custom-provider',
  model: 'image-model',
  mode: 'edit',
  prompt: 'Make it blue',
  files: [],
  editReceipt: {
    parentPaintingId: 'root',
    parentFileId: 'second-output',
    originalPrompt: 'A red house',
    instruction: 'Make it blue',
    execution: {
      mode: 'edit',
      interface: 'ai-sdk:image',
      adapter: 'openai',
      requestedSize: '1024x1024',
      requestedQuality: 'high'
    }
  }
}

describe('PaintingRecord', () => {
  // Catches presenting draft settings as historical effective values or hiding execution provenance.
  it('shows immutable source facts and leaves unreported effective settings unknown', async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <PaintingRecord painting={painting} fileId="child-output" />
      </I18nextProvider>
    )
    const toggle = screen.getByRole('button', {
      name: i18n.t('paintings.workbench.generation_record')
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('region', {
      name: i18n.t('paintings.workbench.generation_record')
    })
    for (const value of [
      'A red house',
      'Make it blue',
      'second-output',
      'custom-provider',
      'image-model',
      'ai-sdk:image',
      'openai',
      '1024x1024',
      'high'
    ]) {
      expect(within(panel).getByText(value)).toBeInTheDocument()
    }
    expect(within(panel).getAllByText(i18n.t('paintings.workbench.unknown'))).toHaveLength(2)
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows legacy prompt without inventing edit instruction or execution history', async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <PaintingRecord painting={{ ...painting, editReceipt: undefined }} fileId="old-output" />
      </I18nextProvider>
    )
    await user.click(screen.getByRole('button', { name: i18n.t('paintings.workbench.generation_record') }))
    expect(screen.getByText(i18n.t('paintings.workbench.legacy_lineage'))).toBeInTheDocument()
    expect(screen.queryByText('ai-sdk:image')).not.toBeInTheDocument()
    expect(screen.getByText('Make it blue')).toBeInTheDocument()
  })
})
