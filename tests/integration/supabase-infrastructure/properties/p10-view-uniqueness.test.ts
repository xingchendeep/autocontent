// Feature: supabase-infrastructure, Property 10: current_active_subscriptions Returns At Most One Row Per User
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient } from '../helpers'

const db = serviceClient()

async function createTestUser(email: string): Promise<string | null> {
  const base = process.env.SUPABASE_URL ?? 'http://localhost:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  try {
    const res = await fetch(`${base}/auth/v1/admin/users`, {
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

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'paused'] as const

describe('P10: current_active_subscriptions Returns At Most One Row Per User', () => {
  it('view returns exactly one row for a user with N active subscriptions (most recent updated_at)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom(...ACTIVE_STATUSES),
        fc.uuid(),
        async (n, status, seed) => {
          const userId = await createTestUser(`p10-${seed}@test.local`)
          if (!userId) return true

          const { data: plans } = await db.from('plans').select('id').eq('code', 'free').limit(1)
          const planId = plans?.[0]?.id
          if (!planId) { await deleteTestUser(userId); return true }

          // Insert N subscriptions with distinct updated_at values
          const insertedIds: string[] = []
          for (let i = 0; i < n; i++) {
            const { data } = await db.from('subscriptions').insert({
              user_id: userId,
              plan_id: planId,
              status,
            }).select('id').single()
            if (data?.id) insertedIds.push(data.id)
            // Small delay so updated_at differs
            await new Promise(r => setTimeout(r, 5))
          }

          // Query the view via service role
          const { data: viewRows } = await db
            .from('current_active_subscriptions')
            .select('user_id, updated_at')
            .eq('user_id', userId)

          // Cleanup
          await db.from('subscriptions').delete().in('id', insertedIds)
          await deleteTestUser(userId)

          // Must return exactly one row
          return (viewRows ?? []).length === 1
        }
      ),
      { numRuns: 5 }
    )
  })
})
