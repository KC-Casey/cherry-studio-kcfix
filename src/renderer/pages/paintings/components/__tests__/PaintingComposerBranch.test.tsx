import { MockUseDataApiUtils } from '@test-mocks/renderer/useDataApi'
import { MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ComposerToolRuntime from '@renderer/components/composer/ComposerToolRuntime'
import { QuickPanelProvider } from '@renderer/components/QuickPanel'
import { COMPOSER_FILE_KIND, FILE_TYPE } from '@renderer/types/file'
import type { ComposerAttachment } from '@renderer/utils/message/composerAttachment'
import type { FileEntry } from '@shared/data/types/file'
import { createUniqueModelId, MODEL_CAPABILITY, MODALITY, type Model } from '@shared/data/types/model'
import type { AbsoluteFilePath } from '@shared/types/file'

import type { MaterializeInputs } from '../../hooks/usePaintingGenerationSubmit'
import type { PaintingData } from '../../model/types/paintingData'
import PaintingComposer from '../PaintingComposer'

// Tool launchers and settings are independently tested; keep the actual editor,
// file-state provider, input resolver, and model capability predicate together.
vi.mock('@renderer/components/composer/ComposerSurface', async () => ({
  default: (await import('@renderer/components/composer/ComposerSurfaceRuntime')).default
}))
vi.mock('@renderer/components/composer/ComposerToolRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof ComposerToolRuntime>()
  return {
    ...actual,
    ComposerToolRuntimeHost: () => {
      const { setFiles } = actual.useComposerToolDispatch()
      return (
        <button
          type="button"
          onClick={() =>
            setFiles((files: ComposerAttachment[]) => [
              ...files,
              {
                fileTokenSourceId: 'pasted-instruction',
                path: '/tmp/pasted-instruction.txt' as AbsoluteFilePath,
                name: 'pasted-instruction.txt',
                origin_name: 'Pasted instruction',
                ext: '.txt',
                size: 2000,
                type: FILE_TYPE.TEXT,
                composerFileKind: COMPOSER_FILE_KIND.PASTED_TEXT
              }
            ])
          }>
          Attach pasted-text fixture
        </button>
      )
    }
  }
})
vi.mock('../PaintingModelSelector', () => ({ default: () => null }))
vi.mock('../PaintingPromptPresetsDialog', () => ({ PaintingPromptPresetsDialog: () => null }))
vi.mock('@renderer/components/composer/variants/shared/ComposerDictationButton', () => ({
  ComposerDictationButton: () => null
}))

const parent = { id: 'parent-output', name: 'source.png', ext: 'png', size: 100, origin: 'internal' } as FileEntry
const models: Model[] = [false, true].map((editing) => ({
  id: createUniqueModelId('openai', editing ? 'editing' : 'generation-only'),
  providerId: 'openai',
  apiModelId: editing ? 'editing' : 'generation-only',
  name: editing ? 'Editing' : 'Generation only',
  capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
  inputModalities: editing ? [MODALITY.TEXT, MODALITY.IMAGE] : [MODALITY.TEXT],
  isEnabled: true,
  isHidden: false,
  supportsStreaming: false
}))
const branch: PaintingData = {
  id: 'branch',
  providerId: 'openai',
  model: 'generation-only',
  mode: 'edit',
  prompt: '',
  files: [],
  inputFiles: [parent],
  editReceipt: {
    parentPaintingId: 'original',
    parentFileId: parent.id,
    originalPrompt: 'Original image',
    instruction: ''
  }
}

function Harness({ initial = branch }: { initial?: PaintingData }) {
  const [painting, setPainting] = useState(initial)
  const [submitted, setSubmitted] = useState('')
  const generate = async (materialize: MaterializeInputs) => {
    const result = await materialize()
    if (result.complete) setSubmitted(`${painting.prompt}|${result.entries.map((entry) => entry.id).join(',')}`)
  }
  return (
    <QuickPanelProvider>
      <button type="button" onClick={() => setPainting((value) => ({ ...value, model: 'editing' }))}>
        Select editing model
      </button>
      <PaintingComposer
        painting={painting}
        generating={false}
        submitting={false}
        onPromptChange={(prompt) => setPainting((value) => ({ ...value, prompt }))}
        onGenerate={generate}
        onCancel={() => {}}
        onModelSelect={() => {}}
        onConfigChange={() => {}}
      />
      <div aria-label="Submitted instruction">{submitted}</div>
    </QuickPanelProvider>
  )
}

describe('PaintingComposer edit recovery', () => {
  beforeEach(async () => {
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
    MockUseDataApiUtils.resetMocks()
    MockUseDataApiUtils.mockQueryData('/models', models)
    MockUsePreferenceUtils.setPreferenceValue('chat.input.paste_long_text_as_file', true)
    await i18next.changeLanguage('en-us')
    window.api.file = {
      ...window.api.file,
      getPhysicalPath: vi.fn(async ({ id }: { id: string }) => `/tmp/${id}.png` as AbsoluteFilePath),
      getPathForFile: vi.fn(() => ''),
      createInternalEntry: vi.fn()
    }
  })

  // Previously an image-generation-only model silently stranded every new branch.
  it('explains the blocked model and sends the same parent after capability recovery', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByRole('status')).toHaveTextContent('not configured for image editing')
    expect(await screen.findByAltText('source.png')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: 'Select editing model' }))
    // The rich editor exposes its maintained composer-input boundary, not a textbox role.
    const editor = document.querySelector<HTMLElement>('[data-ui~="part:composer-input"] [contenteditable="true"]')!
    await user.click(editor)
    await user.paste('Make the sky purple')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'false'))
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Submitted instruction')).toHaveTextContent('Make the sky purple|parent-output')
    )
  })

  it('keeps a missing-model branch visible and explains how to recover', async () => {
    render(<Harness initial={{ ...branch, model: 'removed-model' }} />)
    expect(await screen.findByRole('status')).toHaveTextContent('selected model is unavailable')
    expect(await screen.findByAltText('source.png')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true')
  })

  // A document capsule must not disappear into the tray or be silently ignored at send.
  it('requires document recovery and preserves the parent when the capsule is removed', async () => {
    const user = userEvent.setup()
    const documentEntry = { ...parent, id: 'pasted-text', name: 'pasted.txt', ext: 'txt' }
    render(
      <Harness initial={{ ...branch, model: 'editing', prompt: 'Make it blue', inputFiles: [parent, documentEntry] }} />
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Only images can be attached here')
    expect(await screen.findByText('pasted.txt')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('pasted.txt')).not.toBeInTheDocument())
    expect(screen.getByAltText('source.png')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'false'))
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Submitted instruction')).toHaveTextContent(/Make it blue\s*\|parent-output$/)
    )
  })

  it('expands a pasted-text capsule into the full instruction without losing its parent', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...branch, model: 'editing' }} />)
    await screen.findByAltText('source.png')
    const fileText = 'Preserve every face and change only the background. '.repeat(40)
    window.api.fs = { ...window.api.fs, readText: vi.fn(async () => fileText) }
    // Seed the same attachment descriptor produced by long-text paste without
    // enabling that chat-only conversion in painting. Editor and expansion stay real.
    const editor = document.querySelector<HTMLElement>('[data-ui~="part:composer-input"] [contenteditable="true"]')!
    await user.click(editor)
    await user.paste('Make it blue: ')
    await user.click(screen.getByRole('button', { name: 'Attach pasted-text fixture' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Only images can be attached here')
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(await screen.findByRole('button', { name: 'Paste into input' }))
    expect(window.api.fs.readText).toHaveBeenCalledWith('/tmp/pasted-instruction.txt')
    await waitFor(() => expect(screen.queryByText('Pasted instruction')).not.toBeInTheDocument())
    expect(screen.getByAltText('source.png')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'false'))
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      const submitted = screen.getByLabelText('Submitted instruction').textContent
      expect(submitted).toMatch(/^Make it blue:\s+/)
      expect(submitted.replace(/^Make it blue:\s+/, '')).toBe(`${fileText}|parent-output`)
    })
    expect(window.api.file.createInternalEntry).not.toHaveBeenCalled()
  })

  // Painting accepts images, so the chat preference must not turn long instructions into files.
  it('sends long pasted instructions inline even when chat paste-as-file is enabled', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...branch, model: 'editing' }} />)
    await screen.findByAltText('source.png')
    const editor = document.querySelector<HTMLElement>('[data-ui~="part:composer-input"] [contenteditable="true"]')!
    await user.click(editor)
    const instruction = 'Keep the source image and change the lighting. '.repeat(50)
    await user.paste(instruction)
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Submitted instruction')).toHaveTextContent(`${instruction}|parent-output`)
    )
    expect(screen.queryByText('pasted_text.txt')).not.toBeInTheDocument()
  })
})
