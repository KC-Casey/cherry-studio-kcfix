import { MockCacheUtils } from '@test-mocks/renderer/CacheService'
import { mockDataApiService, MockDataApiUtils } from '@test-mocks/renderer/DataApiService'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TabIdProvider } from '@renderer/components/layout/TabIdProvider'

import type { PaintingData } from '../model/types/paintingData'

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  files: [] as { id: string }[],
  generate: vi.fn(),
  generating: false,
  historyItems: [] as PaintingData[],
  historyIsLoading: false,
  draftModelId: undefined as string | undefined,
  draftProviderId: 'provider-1',
  modelOptions: [{ value: 'model-1', isEnabled: true }] as { value: string; isEnabled?: boolean }[],
  persistedAt: undefined as string | undefined,
  saveCurrent: vi.fn(),
  submitting: false,
  templates: [] as { id: string; imageUrl: string; label: string; prompt: string }[]
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@data/hooks/useCache', () => ({
  useCache: () => [undefined]
}))

vi.mock('@renderer/components/QuickPanel', () => ({
  QuickPanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('../components/Artboard', () => ({ default: () => <div data-testid="painting-artboard" /> }))

vi.mock('../components/PaintingComposer', () => ({
  default: ({
    painting,
    submitting,
    onGenerate,
    onPromptChange
  }: {
    painting: { model?: string; prompt?: string; providerId: string }
    submitting: boolean
    onGenerate: () => void
    onPromptChange: (prompt: string) => void
  }) => (
    <div
      data-testid="painting-composer"
      data-model-id={painting.model}
      data-provider-id={painting.providerId}
      style={{ height: painting.prompt ? 180 : 64 }}>
      <textarea
        aria-label="painting prompt"
        value={painting.prompt ?? ''}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      <button type="button" disabled={submitting} onClick={onGenerate}>
        generate
      </button>
    </div>
  )
}))

vi.mock('../components/PaintingStrip', () => ({
  default: ({
    items,
    onSelectPainting
  }: {
    items: PaintingData[]
    onSelectPainting: (painting: PaintingData, id: string) => void
  }) => (
    <div>
      {items.flatMap((painting) =>
        painting.files.map((file) => (
          <button type="button" key={file.id} onClick={() => onSelectPainting(painting, file.id)}>
            select {file.id}
          </button>
        ))
      )}
    </div>
  )
}))

vi.mock('../hooks/usePaintingGenerationSubmit', () => ({
  usePaintingGenerationSubmit: () => ({
    generating: mocks.generating,
    submitting: mocks.submitting,
    submit: mocks.generate,
    cancel: mocks.cancel
  })
}))

vi.mock('../hooks/usePaintingHistory', () => ({
  usePaintingHistory: () => ({
    items: mocks.historyItems,
    isLoading: mocks.historyIsLoading,
    hasMore: false,
    loadMore: vi.fn()
  })
}))

vi.mock('../hooks/usePaintingDraftDefaults', () => ({
  usePaintingDraftDefaults: () => ({
    providerId: mocks.draftProviderId,
    modelId: mocks.draftModelId
  })
}))

vi.mock('../hooks/usePaintingList', () => ({
  usePaintingList: () => ({
    add: vi.fn(),
    remove: vi.fn(),
    saveCurrent: mocks.saveCurrent,
    select: vi.fn()
  })
}))

vi.mock('../hooks/usePaintingModelCatalog', () => ({
  usePaintingModelCatalog: () => ({
    currentModelOptions: mocks.modelOptions,
    ensureCurrentCatalog: vi.fn(),
    ensureProviderCatalog: vi.fn()
  })
}))

vi.mock('../hooks/usePaintingModelSwitch', () => ({
  usePaintingModelSwitch: () => vi.fn()
}))

vi.mock('../hooks/usePaintingProviderOptions', () => ({
  usePaintingProviderOptions: () => []
}))

vi.mock('../hooks/usePaintingResultSync', () => ({
  usePaintingResultSync: vi.fn()
}))

vi.mock('../model/paintingPipeline', () => ({
  createDefaultPainting: ({ providerId, modelId }: { providerId: string; modelId?: string }) => ({
    id: 'painting-1',
    providerId,
    mode: 'generate',
    prompt: '',
    files: mocks.files,
    params: {},
    model: modelId,
    persistedAt: mocks.persistedAt
  })
}))

vi.mock('../model/utils/paintingGenerationParams', () => ({
  cacheToPaintingGenerationState: () => ({})
}))

const { default: PaintingPage } = await import('../PaintingPage')

describe('PaintingPage workbench', () => {
  beforeEach(() => {
    MockDataApiUtils.resetMocks()
    MockCacheUtils.resetMocks()
    mocks.cancel.mockReset()
    mocks.files = []
    mocks.generate.mockReset()
    mocks.generating = false
    mocks.historyItems = []
    mocks.historyIsLoading = false
    mocks.draftModelId = undefined
    mocks.draftProviderId = 'provider-1'
    mocks.modelOptions = [{ value: 'model-1', isEnabled: true }]
    mocks.persistedAt = undefined
    mocks.saveCurrent.mockReset()
    mocks.submitting = false
    mocks.templates = Array.from({ length: 25 }, (_, index) => ({
      id: index === 0 ? 'human-fragments-motion' : `template-${index}`,
      imageUrl: `/template-${index}.webp`,
      label: index === 0 ? 'Motion Step' : `painting template ${index}`,
      prompt: index === 0 ? 'Create a poster for ${CITY RHYTHM}' : `painting prompt ${index}`
    }))
  })

  it('uses the configured painting model for a new page draft', () => {
    mocks.draftProviderId = 'openai'
    mocks.draftModelId = 'dall-e-3'

    render(<PaintingPage />)

    expect(screen.getByTestId('painting-composer')).toHaveAttribute('data-provider-id', 'openai')
    expect(screen.getByTestId('painting-composer')).toHaveAttribute('data-model-id', 'dall-e-3')
  })

  it('falls back to the first enabled model when the configured model is unavailable', () => {
    mocks.modelOptions = [
      { value: 'disabled-model', isEnabled: false },
      { value: 'enabled-model', isEnabled: true }
    ]

    render(<PaintingPage />)

    expect(screen.getByTestId('painting-composer')).toHaveAttribute('data-model-id', 'enabled-model')
  })

  it('keeps the original prompt record separate from the current edit instruction after selecting history', async () => {
    mocks.historyItems = [
      {
        id: 'old-painting',
        providerId: 'openai',
        mode: 'generate',
        model: 'gpt-image-1',
        prompt: 'A red house',
        files: [{ id: 'output-2' }] as PaintingData['files']
      }
    ]
    MockDataApiUtils.setCustomResponse('/files/entries/output-2', 'GET', { id: 'output-2' })
    render(<PaintingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'select output-2' }))
    await waitFor(() => expect(screen.getByText('A red house')).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'painting prompt' })).toHaveValue('')
    expect(screen.getByText('paintings.workbench.original_prompt')).toBeInTheDocument()
    expect(screen.getByText('paintings.workbench.instruction')).toBeInTheDocument()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('restores the selected output and unsent instruction after navigating away and back', async () => {
    const user = userEvent.setup()
    mocks.historyItems = [
      {
        id: 'old-painting',
        providerId: 'openai',
        mode: 'generate',
        model: 'gpt-image-1',
        prompt: 'A red house',
        files: [{ id: 'output-2' }] as PaintingData['files']
      }
    ]
    MockDataApiUtils.setCustomResponse('/files/entries/output-2', 'GET', { id: 'output-2' })
    const page = () => (
      <StrictMode>
        <TabIdProvider tabId="workbench-tab">
          <PaintingPage />
        </TabIdProvider>
      </StrictMode>
    )
    const first = render(page())
    await user.click(screen.getByRole('button', { name: 'select output-2' }))
    await screen.findByRole('region', { name: 'paintings.workbench.generation_record' })
    await user.type(screen.getByRole('textbox', { name: 'painting prompt' }), 'Add a blue roof')
    first.unmount()
    mocks.draftProviderId = 'another-provider'
    mocks.draftModelId = 'another-model'

    render(page())

    expect(screen.getByRole('textbox', { name: 'painting prompt' })).toHaveValue('Add a blue roof')
    expect(screen.getByText('A red house')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'paintings.workbench.generation_record' })).toBeInTheDocument()
  })

  it('keeps drafts independent in two mounted tabs and restores each tab separately', async () => {
    const user = userEvent.setup()
    const page = (tabId: string) => (
      <TabIdProvider tabId={tabId}>
        <PaintingPage />
      </TabIdProvider>
    )
    const first = render(page('first-tab'))
    const second = render(page('second-tab'))
    await user.type(within(first.container).getByRole('textbox', { name: 'painting prompt' }), 'First draft')
    await user.type(within(second.container).getByRole('textbox', { name: 'painting prompt' }), 'Second draft')
    first.unmount()
    second.unmount()

    const restoredSecond = render(page('second-tab'))
    const restoredFirst = render(page('first-tab'))

    expect(within(restoredFirst.container).getByRole('textbox', { name: 'painting prompt' })).toHaveValue('First draft')
    expect(within(restoredSecond.container).getByRole('textbox', { name: 'painting prompt' })).toHaveValue(
      'Second draft'
    )
  })

  it('shows an unavailable parent explicitly instead of silently omitting comparison', async () => {
    mocks.historyItems = [
      {
        id: 'child',
        providerId: 'openai',
        mode: 'edit',
        prompt: 'make it blue',
        files: [{ id: 'child-output' }] as PaintingData['files'],
        editReceipt: {
          parentPaintingId: 'not-loaded',
          parentFileId: 'missing-parent',
          originalPrompt: 'A red house',
          instruction: 'make it blue'
        }
      }
    ]
    mockDataApiService.get.mockImplementation(async (path) => {
      if (path === '/files/entries/child-output') return { id: 'child-output' }
      throw new Error('Parent file is unavailable')
    })
    render(<PaintingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'select child-output' }))
    await waitFor(() => expect(screen.getByText('paintings.workbench.parent_unavailable')).toBeInTheDocument())
  })

  it('keeps sending disabled while request preparation is pending', () => {
    mocks.submitting = true
    render(<PaintingPage />)
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled()
  })
})
