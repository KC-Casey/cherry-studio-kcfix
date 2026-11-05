import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import type * as CherryStudioUi from '@cherrystudio/ui'
import en from '@renderer/i18n/locales/en-us.json'

import type { PaintingData } from '../../model/types/paintingData'

vi.mock('@cherrystudio/ui', async (importOriginal) => importOriginal<typeof CherryStudioUi>())
const { default: PaintingStrip } = await import('../PaintingStrip')
const i18n = createInstance()
await i18n.init({
  lng: 'en',
  keySeparator: false,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false }
})

const root: PaintingData = {
  id: 'root',
  providerId: 'openai',
  mode: 'generate',
  model: 'gpt-image-1',
  prompt: 'A red house',
  files: [
    { id: 'first', path: '/first.png' },
    { id: 'second', path: '/second.png' }
  ] as PaintingData['files'],
  editReceipt: { originalPrompt: 'A red house', instruction: 'A red house' }
}
function child(id: string, parent = root, parentFileId = 'second'): PaintingData {
  return {
    ...root,
    id,
    files: [{ id: `${id}-output`, path: `/${id}.png` }] as PaintingData['files'],
    editReceipt: {
      parentPaintingId: parent.id,
      parentFileId,
      originalPrompt: 'A red house',
      instruction: id
    }
  }
}
function show(items: PaintingData[], onSelect = vi.fn()) {
  const onDelete = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <PaintingStrip
        items={items}
        hasMore={false}
        loadMore={vi.fn()}
        onDeletePainting={onDelete}
        onSelectPainting={onSelect}
        onAddPainting={vi.fn()}
      />
    </I18nextProvider>
  )
  return { onSelect, onDelete }
}
const outputLabel = (id: string) => i18n.t('paintings.workbench.output_label', { id })
const parentLabel = (id: string) => i18n.t('paintings.workbench.parent_label', { id })

describe('PaintingStrip lineage', () => {
  // Catches grouping by painting alone: the branch belongs to the second output, not the first.
  it('shows parent-first branches and selects the exact historical output', async () => {
    const user = userEvent.setup()
    const b = child('b')
    const c = child('c', b, 'b-output')
    const d = child('d')
    const { onSelect } = show([c, d, b, root])
    expect(screen.getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual(
      ['first', 'second', 'd-output', 'b-output', 'c-output'].map(outputLabel)
    )
    const branch = screen.getByRole('listitem', { name: outputLabel('b-output') })
    await user.click(within(branch).getByRole('button', { name: parentLabel('second') }))
    expect(onSelect).toHaveBeenLastCalledWith(root, 'second')
    await user.click(within(branch).getByRole('button', { name: outputLabel('b-output') }))
    expect(onSelect).toHaveBeenLastCalledWith(b, 'b-output')
  })

  // Catches lost children before their parent page arrives and fabricated legacy roots.
  it('keeps unloaded parents distinct from legacy unknown ancestry', () => {
    const b = child('b')
    const legacy = { ...root, id: 'legacy', files: [], editReceipt: undefined }
    show([b, legacy])
    const branch = screen.getByRole('listitem', { name: outputLabel('b-output') })
    expect(within(branch).getByText(i18n.t('paintings.workbench.parent_not_loaded'))).toBeInTheDocument()
    expect(within(branch).queryByRole('button', { name: parentLabel('second') })).not.toBeInTheDocument()
    expect(screen.getByText(i18n.t('paintings.workbench.legacy_lineage'))).toBeInTheDocument()
  })

  it('deletes the selected output’s painting rather than its parent', async () => {
    const user = userEvent.setup()
    const b = child('b')
    const { onDelete, onSelect } = show([b, root])
    await user.click(
      within(screen.getByRole('listitem', { name: outputLabel('b-output') })).getByRole('button', {
        name: i18n.t('paintings.button.delete.image.label')
      })
    )
    expect(onDelete).toHaveBeenCalledWith(b)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
