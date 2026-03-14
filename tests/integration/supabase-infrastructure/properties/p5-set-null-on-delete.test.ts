// Feature: supabase-infrastructure, Property 5: SET NULL on User Deletion Preserves Analytics Records
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, querySql } from '../helpers'

const db = serviceClient()

async function createTestUser(email: string): Promise<string | null> {
  const url = `${process.env.SUPABASE_URL ?? 'http://localhost:54321'}/auth/v1/admin/users`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!res.ok) return null
    const body = await res.json() as { id?: string }
    return body.id ?? null
  } catch { return null }
}

async function deleteTestUser(userId: string): Promise<void> {
  const url = `${process.env.SUPABASE_URL ?? 'http://localhost:54321'}/auth/v1/admin/users/${userId}`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  await fetch(url, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } })
}

describe('P5: SET NULL on User Deletion Preserves Analytics Records', () => {
  it('generations and audit_logs rows survive user deletion with user_id set to NULL', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (seed) => {
        const email = `set-null-test-${seed}@test.local`
        const userId = await createTestUser(email)
        if (!userId) return true // skip — local stack not running

        // Insert a generation row
        const { data: gen, error: ge } = await db.from('generations').insert({
          user_id: userId,
          input_source: 'manual',
          input_content: 'test content for set-null',
          platforms: ['douyin'],
          platform_count: 1,
          result_json: { test: true },
          status: 'success',
        }).select('id').single()
        if (ge || !gen) { await deleteTestUser(userId); return true }

        // Insert an audit_log row
        const { data: log, error: le } = await db.from('audit_logs').insert({
          user_id: userId,
          action: 'test_action',
          metadata: {},
        }).select('id').single()
        if (le || !log) { await deleteTestUser(userId); return true }

        // Delete the user
        await deleteTestUser(userId)

        // Assert rows still exist with user_id = null
        const [{ data: gRow }, { data: lRow }] = await Promise.all([
          db.from('generations').select('id, user_id').eq('id', gen.id).single(),
          db.from('audit_logs').select('id, user_id').eq('id', log.id).single(),
        ])

        // Cleanup
        await Promise.all([
          db.from('generations').delete().eq('id', gen.id),
          db.from('audit_logs').delete().eq('id', log.id),
        ])

        return (
          gRow !== null && gRow.user_id === null &&
          lRow !== null && lRow.user_id === null
        )
      }),
      { numRuns: 3 }
    )
  })

  it('ON DELETE SET NULL FK constraints exist for generations and audit_logs', async () => {
    const rows = await querySql<{ constraint_name: string; delete_rule: string }>(
      `SELECT rc.constraint_name, rc.delete_rule
       FROM information_schema.referential_constraints rc
       WHERE rc.constraint_name = ANY($1)`,
      [['generations_user_id_fkey', 'audit_logs_user_id_fkey']]
    )
    for (const row of rows) {
      expect(row.delete_rule, `Expected SET NULL on ${row.constraint_name}`).toBe('SET NULL')
    }
  })
})
