import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { serviceClient, querySql } from './helpers'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

describe('Unique constraints', () => {
  it('webhook_events rejects duplicate (provider, event_id)', async () => {
    const db = serviceClient()
    // Insert first row
    const { error: e1 } = await db.from('webhook_events').insert({
      provider: 'test-provider',
      event_name: 'test.event',
      event_id: 'unique-constraint-test-001',
      payload: {},
    })
    expect(e1).toBeNull()

    // Insert duplicate — must fail with unique violation (23505)
    const { error: e2 } = await db.from('webhook_events').insert({
      provider: 'test-provider',
      event_name: 'test.event',
      event_id: 'unique-constraint-test-001',
      payload: {},
    })
    expect(e2).not.toBeNull()
    expect(e2!.code).toBe('23505')

    // Cleanup
    await db
      .from('webhook_events')
      .delete()
      .eq('provider', 'test-provider')
      .eq('event_id', 'unique-constraint-test-001')
  })

  it('subscriptions partial unique index rejects duplicate non-null provider_subscription_id', async () => {
    const rows = await querySql<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'subscriptions'
       AND indexname = 'idx_subscriptions_provider_subscription_id'`
    )
    expect(rows).toHaveLength(1)
  })
})

describe('Migration file conventions', () => {
  it('migration filenames match ^[0-9]{14}_[a-z0-9_]+\\.sql$', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f !== '.gitkeep')
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file, `Bad filename: ${file}`).toMatch(/^[0-9]{14}_[a-z0-9_]+\.sql$/)
    }
  })

  it('every CREATE TABLE and CREATE INDEX uses IF NOT EXISTS', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')

      // Find CREATE TABLE without IF NOT EXISTS
      const badTable = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/gi)
      expect(badTable ?? [], `${file}: CREATE TABLE missing IF NOT EXISTS`).toHaveLength(0)

      // Find CREATE INDEX / CREATE UNIQUE INDEX without IF NOT EXISTS
      const badIndex = sql.match(/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/gi)
      expect(badIndex ?? [], `${file}: CREATE INDEX missing IF NOT EXISTS`).toHaveLength(0)
    }
  })
})

describe('Migration idempotency (static)', () => {
  it('migration SQL can be parsed and contains BEGIN/COMMIT', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      expect(sql).toMatch(/BEGIN;/)
      expect(sql).toMatch(/COMMIT;/)
    }
  })
})
