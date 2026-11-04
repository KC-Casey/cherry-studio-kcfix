import { uuid } from '@renderer/utils/uuid'
import type { FileEntry } from '@shared/data/types/file'

import type { PaintingData } from './types/paintingData'

/** A branch starts with an empty instruction and one exact parent output. */
export function createPaintingBranch(source: PaintingData, input: FileEntry): PaintingData {
  if (!source.files.some((file) => file.id === input.id)) {
    throw new Error('The edit input must be an output of the selected painting.')
  }
  return {
    id: uuid(),
    providerId: source.providerId,
    model: source.model,
    mode: 'edit',
    prompt: '',
    files: [],
    inputFiles: [input],
    params: { ...source.params },
    editReceipt: {
      parentPaintingId: source.id,
      parentFileId: input.id,
      originalPrompt: source.editReceipt?.originalPrompt ?? source.prompt,
      instruction: ''
    }
  }
}
