import * as z from 'zod'

/** User-selected image operation; new execution receipts persist its resolved value. */
export const PaintingModeSchema = z.string().trim().min(1)
export type PaintingMode = z.infer<typeof PaintingModeSchema>

export const PaintingFilesSchema = z.strictObject({
  output: z.array(z.string()),
  input: z.array(z.string())
})
export type PaintingFiles = z.infer<typeof PaintingFilesSchema>

export const PaintingExecutionSchema = z.strictObject({
  mode: z.string().min(1),
  interface: z.enum(['ai-sdk:image', 'job:image']),
  adapter: z
    .string()
    .regex(/^[a-zA-Z0-9_.:-]+$/)
    .max(128),
  requestedSize: z.string().max(64).optional(),
  requestedQuality: z.string().max(64).optional(),
  effectiveSize: z.string().max(64).optional(),
  effectiveQuality: z.string().max(64).optional()
})
export type PaintingExecution = z.infer<typeof PaintingExecutionSchema>

export const PaintingEditReceiptSchema = z
  .strictObject({
    parentPaintingId: z.string().min(1).optional(),
    parentFileId: z.string().min(1).optional(),
    originalPrompt: z.string(),
    instruction: z.string(),
    execution: PaintingExecutionSchema.optional()
  })
  .refine((value) => Boolean(value.parentPaintingId) === Boolean(value.parentFileId), {
    message: 'Parent painting and output file must be specified together'
  })
export type PaintingEditReceipt = z.infer<typeof PaintingEditReceiptSchema>

export const PaintingSchema = z.strictObject({
  id: z.string(),
  providerId: z.string(),
  modelId: z.string().nullable().optional(),
  prompt: z.string(),
  files: PaintingFilesSchema,
  editReceipt: PaintingEditReceiptSchema.optional(),
  /**
   * Stable snapshot of the referenced FileEntry rows consumed by painting history hydration.
   * List/get responses populate it so renderer caches can reject stale file metadata without
   * repeating per-entry DataApi and physical-path IPC on an unchanged refresh.
   */
  fileDataFingerprint: z.string().optional(),
  orderKey: z.string().min(1),
  // ISO 8601 (matches the assistant/topic/tag/note/prompt convention); the
  // service emits these via `timestampToISO`. `id` stays `z.string()` because
  // migration supplies opaque ids.
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /**
   * Read-only trash marker — present only on trashed paintings. Set via
   * `DELETE /paintings/:id` (move to Recycle Bin) and cleared via
   * `POST /paintings/:id/restore`; never writable through create/update DTOs.
   */
  deletedAt: z.iso.datetime().optional()
})

export type Painting = z.infer<typeof PaintingSchema>
