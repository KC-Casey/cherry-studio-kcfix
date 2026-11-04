import { resolve } from 'node:path'

import { setupTestDatabase } from '@test-helpers/db'
import { describe, expect, it } from 'vitest'

import { applyMigrations } from '@data/db/applyMigrations'

// Protect historical rows and file ownership when receipt metadata is added.
describe('painting receipt migrate-forward', () => {
  const dbh = setupTestDatabase({ beforeMigration: '0034_exotic_molecule_man' })

  it('preserves populated pre-receipt paintings and file references without inventing lineage', () => {
    dbh.sqlite
      .prepare(
        "INSERT INTO painting (id, provider_id, model_id, prompt, order_key, created_at, updated_at) VALUES ('old-painting', 'openai', 'openai::image-model', 'original prompt', 'a0', 100, 200)"
      )
      .run()
    dbh.sqlite
      .prepare(
        "INSERT INTO painting (id, provider_id, prompt, order_key, created_at, updated_at, deleted_at) VALUES ('trashed-painting', 'openai', 'trashed prompt', 'a1', 100, 200, 300)"
      )
      .run()
    dbh.sqlite
      .prepare(
        "INSERT INTO file_entry (id, origin, name, ext, size, created_at, updated_at) VALUES ('old-output', 'internal', 'image', 'png', 10, 100, 200)"
      )
      .run()
    dbh.sqlite
      .prepare(
        "INSERT INTO painting_file_ref (id, file_entry_id, source_id, role, created_at, updated_at) VALUES ('old-ref', 'old-output', 'old-painting', 'output', 100, 200)"
      )
      .run()
    const rowsBefore = dbh.sqlite.prepare('SELECT * FROM painting ORDER BY id').all()
    const refsBefore = dbh.sqlite.prepare('SELECT * FROM painting_file_ref').all()
    const filesBefore = dbh.sqlite.prepare('SELECT * FROM file_entry').all()

    applyMigrations(dbh.db, resolve('migrations/sqlite-drizzle'))
    applyMigrations(dbh.db, resolve('migrations/sqlite-drizzle'))

    const rowsAfter = dbh.sqlite.prepare('SELECT * FROM painting ORDER BY id').all() as Record<string, unknown>[]
    expect(
      rowsAfter.map(({ edit_receipt, ...row }) => {
        expect(edit_receipt).toBeNull()
        return row
      })
    ).toEqual(rowsBefore)
    expect(dbh.sqlite.prepare('SELECT * FROM painting_file_ref').all()).toEqual(refsBefore)
    expect(dbh.sqlite.prepare('SELECT * FROM file_entry').all()).toEqual(filesBefore)
    expect(dbh.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(dbh.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  })
})
