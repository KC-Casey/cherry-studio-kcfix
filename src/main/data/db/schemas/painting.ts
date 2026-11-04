import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { PaintingEditReceipt } from '@shared/data/types/painting'

import { createUpdateDeleteTimestamps, orderKeyColumns, orderKeyIndex, uuidPrimaryKey } from './_columnHelpers'

/**
 * Painting row — a frozen receipt of a completed image generation.
 *
 * Output and input files are NOT stored on the row. Each painting has zero or
 * more `painting_file_ref` rows with `sourceId=painting.id`,
 * `role='output'|'input'`. PaintingService writes those refs on create/update;
 * row deletion cascades refs at the database layer. Optional editReceipt stores
 * frozen lineage and execution metadata; mutable draft state stays in React.
 */
export const paintingTable = sqliteTable(
  'painting',
  {
    id: uuidPrimaryKey(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id'),
    prompt: text().notNull(),
    editReceipt: text('edit_receipt', { mode: 'json' }).$type<PaintingEditReceipt>(),
    ...orderKeyColumns,
    ...createUpdateDeleteTimestamps
  },
  (t) => [orderKeyIndex('painting')(t)]
)

export type PaintingRow = typeof paintingTable.$inferSelect
export type InsertPaintingRow = typeof paintingTable.$inferInsert
