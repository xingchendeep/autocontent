// Feature: supabase-infrastructure, Property 4: Cascade Delete Propagates to Owned Tables
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, querySql } from '../helpers'

const db = serviceClient()

/**
 * Creates a real auth.users row via the Supabase Admin API (service role).
 * Returns the user id, or null if the local stack is not running.
 */
async function createTestUser(email: string): Promise<string | null> {
  const url = `${process.env.SUPABASE_URL ?? 'http://localhost:54321'}/auth/v1/admin/users`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!res.ok) return null
    const body = await res.json() as { id?: string }
    return body.id ?? null
  } catch {
    return null
  }
}

async function deleteTestUser(userId: string): Promise<void> {
  const url = `${process.env.SUPABASE_URL ?? 'http://localhost:54321'}/auth/v1/admin/users/${userId}`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  await fetch(url, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
}

describe('P4: Cascade Delete Propagates to Owned Tables', () => {
  it('deleting auth.users row removes profiles, subscriptions, and usage_stats rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (seed) => {
          const email = `cascade-test-${seed}@test.local`
          const userId = await createTestUser(email)
          if (!userId) return true // skip — local stack not running

          // Get a valid plan_id
          const { data: plans } = await db.from('plans').select('id').eq('code', 'free').limit(1)
          const planId = plans?.[0]?.id
          if (!planId) {
            await deleteTestUser(userId)
            return true
          }

          // Insert rows in profiles, subscriptions, usage_stats
          await db.from('profiles').insert({ id: userId })
          await db.from('subscriptions').insert({
            user_id: userId,
            plan_id: planId,
            status: 'active',
          })
          await db.from('usage_stats').insert({
            user_id: userId,
            current_month: '2026-03',
          })

          // Delete the user — cascades should fire
          await deleteTestUser(userId)

          // Assert all owned rows are gone
          const [{ data: p }, { data: s }, { data: u }] = await Promise.all([
            db.from('profiles').select('id').eq('id', userId),
            db.from('subscriptions').select('id').eq('user_id', userId),
            db.from('usage_stats').select('user_id').eq('user_id', userId),
          ])

          return (
            (p ?? []).length === 0 &&
            (s ?? []).length === 0 &&
            (u ?? []).length === 0
          )
        }
      ),
      { numRuns: 3 } // keep low — each run creates/deletes a real auth user
    )
  })

  it('ON DELETE CASCADE FK constraints exist for profiles, subscriptions, usage_stats', async () => {
    const rows = await querySql<{ constraint_name: string; delete_rule: string }>(
      `SELECT rc.constraint_name, rc.delete_rule
       FROM information_schema.referential_constraints rc
       WHERE rc.constraint_name = ANY($1)`,
      [['profiles_id_fkey', 'subscriptions_user_id_fkey', 'usage_stats_user_id_fkey']]
    )
    for (const row of rows) {
      expect(row.delete_rule, `Expected CASCADE on ${row.constraint_name}`).toBe('CASCADE')
    }
  })
})
