import { describe, it, expect } from 'vitest'
import { serviceClient, querySql } from './helpers'

const db = serviceClient()

describe('Schema structure', () => {
  const EXPECTED_TABLES = [
    'profiles', 'plans', 'subscriptions', 'generations',
    'usage_stats', 'audit_logs', 'webhook_events',
  ]

  it('all 7 tables exist in public schema', async () => {
    const rows = await querySql<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [EXPECTED_TABLES]
    )
    const names = rows.map(r => r.tablename).sort()
    expect(names).toEqual([...EXPECTED_TABLES].sort())
  })

  it('current_active_subscriptions view exists', async () => {
    const rows = await querySql<{ viewname: string }>(
      `SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname = 'current_active_subscriptions'`
    )
    expect(rows).toHaveLength(1)
  })

  it('pgcrypto extension is installed', async () => {
    const rows = await querySql<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`
    )
    expect(rows).toHaveLength(1)
  })

  it('audit_logs has no updated_at column', async () => {
    const rows = await querySql<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'updated_at'`
    )
    expect(rows).toHaveLength(0)
  })

  it('all 6 RLS-protected tables have rowsecurity = true', async () => {
    const RLS_TABLES = ['profiles', 'subscriptions', 'generations', 'usage_stats', 'audit_logs', 'webhook_events']
    const rows = await querySql<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [RLS_TABLES]
    )
    expect(rows).toHaveLength(RLS_TABLES.length)
    for (const row of rows) {
      expect(row.rowsecurity, `RLS not enabled on ${row.tablename}`).toBe(true)
    }
  })

  it('audit_logs and webhook_events have no permissive policies', async () => {
    const rows = await querySql<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [['audit_logs', 'webhook_events']]
    )
    expect(rows).toHaveLength(0)
  })
})

describe('plans seed data', () => {
  it('plans table has exactly 4 rows with correct codes', async () => {
    const { data, error } = await db
      .from('plans')
      .select('code')
      .in('code', ['free', 'creator', 'studio', 'enterprise'])
      .order('code')

    expect(error).toBeNull()
    const codes = (data ?? []).map((r: { code: string }) => r.code).sort()
    expect(codes).toEqual(['creator', 'enterprise', 'free', 'studio'])
  })
})
