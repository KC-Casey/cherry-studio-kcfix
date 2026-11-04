import { describe, expect, it } from 'vitest'

import type { FileEntry } from '@shared/data/types/file'

import { createPaintingBranch } from '../createPaintingBranch'
import type { PaintingData } from '../types/paintingData'

const input = { id: 'output-2' } as FileEntry
const source: PaintingData = {
  id: 'parent',
  providerId: 'provider',
  model: 'edit-model',
  mode: 'generate',
  prompt: 'original composition',
  files: [{ id: 'output-1' }, { id: 'output-2' }] as PaintingData['files'],
  params: { size: '1024x1024' },
  persistedAt: '2026-11-04T00:00:00Z'
}

describe('createPaintingBranch', () => {
  it('uses the exact selected output without reusing the original prompt as an instruction', () => {
    const branch = createPaintingBranch(source, input)
    expect(branch.inputFiles).toEqual([input])
    expect(branch.prompt).toBe('')
    expect(branch.editReceipt).toEqual({
      parentPaintingId: 'parent',
      parentFileId: 'output-2',
      originalPrompt: 'original composition',
      instruction: ''
    })
    expect(branch.files).toEqual([])
    expect(branch.persistedAt).toBeUndefined()
    expect(branch.mode).toBe('edit')
    expect(source.prompt).toBe('original composition')
    expect(source.files).toHaveLength(2)
  })

  it('creates independent sibling branches and retains the root prompt in later generations', () => {
    const edited = {
      ...source,
      prompt: 'make it blue',
      editReceipt: { originalPrompt: 'root composition', instruction: 'make it blue' }
    }
    const first = createPaintingBranch(edited, input)
    const second = createPaintingBranch(edited, input)
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toBe(source.id)
    expect(first.editReceipt?.originalPrompt).toBe('root composition')
    first.params!.size = '512x512'
    expect(second.params?.size).toBe('1024x1024')
  })

  it('refuses an input from another painting rather than fabricating lineage', () => {
    expect(() => createPaintingBranch(source, { id: 'unrelated' } as FileEntry)).toThrow('selected painting')
  })
})
