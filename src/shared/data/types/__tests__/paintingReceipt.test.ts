import { describe, expect, it } from 'vitest'

import { PaintingEditReceiptSchema, PaintingExecutionSchema } from '../painting'

describe('painting receipt boundary', () => {
  it('rejects credentials, request headers and URLs instead of persisting opaque provider data', () => {
    const execution = { mode: 'edit', interface: 'ai-sdk:image', adapter: 'openai' }
    expect(PaintingExecutionSchema.safeParse({ ...execution, apiKey: 'secret' }).success).toBe(false)
    expect(
      PaintingExecutionSchema.safeParse({ ...execution, headers: { Authorization: 'Bearer secret' } }).success
    ).toBe(false)
    expect(
      PaintingExecutionSchema.safeParse({ ...execution, adapter: 'https://user:secret@example.com' }).success
    ).toBe(false)
  })

  it('requires both parent identifiers and leaves unknown effective settings absent', () => {
    expect(
      PaintingEditReceiptSchema.safeParse({ originalPrompt: 'record', instruction: 'edit', parentPaintingId: 'p' })
        .success
    ).toBe(false)
    const receipt = PaintingEditReceiptSchema.parse({
      originalPrompt: 'record',
      instruction: 'edit',
      execution: { mode: 'edit', interface: 'job:image', adapter: 'ppio' }
    })
    expect(receipt.execution).not.toHaveProperty('effectiveSize')
    expect(receipt.execution).not.toHaveProperty('effectiveQuality')
  })
})
