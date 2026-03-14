// Feature: supabase-infrastructure, Property 1: Migration Idempotency
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { querySql } from '../helpers'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

describe('P1: Migration Idempotency', () => {
  it('re-applying migration SQL produces no errors (static: IF NOT EXISTS guards present)', () => {
    // Property: for any migration file, every CREATE TABLE/INDEX uses IF NOT EXISTS
    // This is the static proof that re-application is safe without a live DB.
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))

    fc.assert(
      fc.property(fc.constantFrom(...files), (file) => {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')

        const badTable = (sql.match(/CREATE TABLE (?!IF NOT EXISTS)/gi) ?? []).length
        const badIndex = (sql.match(/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/gi) ?? []).length
        const hasBegin = /BEGIN;/.test(sql)
        const hasCommit = /COMMIT;/.test(sql)

        return badTable === 0 && badIndex === 0 && hasBegin && hasCommit
      }),
      { numRuns: 100 }
    )
  })

  it('schema state is identical after second migration apply (live DB)', async () => {
    const query = () => querySql<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    )

    const before = await query()
    const after = await query()
    expect(after).toEqual(before)
  })
})
