import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Model } from '@shared/data/types/model'

import { ModelCatalogDefaults } from '../ModelCatalogDefaults'

const { query, confirm, showError } = vi.hoisted(() => ({ query: vi.fn(), confirm: vi.fn(), showError: vi.fn() }))
vi.mock('@data/hooks/useDataApi', () => ({ useQuery: query, useDataChange: vi.fn() }))
vi.mock('@renderer/services/popup', () => ({ popup: { confirm } }))
vi.mock('@renderer/services/toast', () => ({ toast: { error: showError } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`
  })
}))

const model: Model = {
  id: 'openai::gpt-image-2.6-flare',
  providerId: 'openai',
  apiModelId: 'gpt-image-2.6-flare',
  name: 'My image model',
  capabilities: [],
  supportsStreaming: true,
  isEnabled: true,
  isHidden: false
}
const catalog: Model = { ...model, presetModelId: 'gpt-image-2-6-flare', capabilities: ['image-generation'] }

describe('catalog default controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReturnValue({ data: [catalog], isLoading: false, refetch: vi.fn() })
    confirm.mockResolvedValue(false)
  })

  it('identifies source and unknown fields without changing configuration on cancel', async () => {
    const restore = vi.fn()
    render(<ModelCatalogDefaults model={model} providerId="openai" enabled busy={false} onRestore={restore} />)
    expect(screen.getByText(/settings.models.catalog.source gpt-image-2-6-flare/)).toBeVisible()
    expect(screen.getByText(/settings.models.catalog.unknown.*settings.models.catalog.pricing/)).toBeVisible()
    expect(restore).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'settings.models.catalog.restore' }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ content: 'settings.models.catalog.confirm' }))
    expect(restore).not.toHaveBeenCalled()
  })

  it('requires confirmation and reports failed restoration', async () => {
    confirm.mockResolvedValue(true)
    const restore = vi.fn().mockRejectedValue(new Error('database unavailable'))
    render(<ModelCatalogDefaults model={model} providerId="openai" enabled busy={false} onRestore={restore} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'settings.models.catalog.restore' }))
    await waitFor(() => expect(showError).toHaveBeenCalledWith('settings.models.catalog.restore_failed'))
    expect(restore).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'settings.models.catalog.restore' })).not.toBeDisabled()
  })

  it.each(['navigation', 'close'])('invalidates pending confirmation on %s', async (action) => {
    let resolve!: (value: boolean) => void
    confirm.mockReturnValue(
      new Promise<boolean>((callback) => {
        resolve = callback
      })
    )
    const restore = vi.fn()
    const { rerender } = render(
      <ModelCatalogDefaults model={model} providerId="openai" enabled busy={false} onRestore={restore} />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'settings.models.catalog.restore' }))
    rerender(
      <ModelCatalogDefaults
        model={action === 'navigation' ? { ...model, id: 'openai::other', apiModelId: 'other' } : model}
        providerId="openai"
        enabled={action !== 'close'}
        busy={false}
        onRestore={restore}
      />
    )
    resolve(true)
    await waitFor(() => expect(restore).not.toHaveBeenCalled())
  })

  it('does not offer restoration for unmatched data or catalog read failures', () => {
    query.mockReturnValue({ data: [model], isLoading: false, refetch: vi.fn() })
    const { rerender } = render(
      <ModelCatalogDefaults model={model} providerId="openai" enabled busy={false} onRestore={vi.fn()} />
    )
    expect(screen.getByText('settings.models.catalog.missing')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'settings.models.catalog.restore' })).not.toBeInTheDocument()
    query.mockReturnValue({ data: [catalog], error: new Error('read failed'), isLoading: false, refetch: vi.fn() })
    rerender(<ModelCatalogDefaults model={model} providerId="openai" enabled busy={false} onRestore={vi.fn()} />)
    expect(screen.getByText('settings.models.catalog.load_failed')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'settings.models.catalog.restore' })).not.toBeInTheDocument()
  })
})
