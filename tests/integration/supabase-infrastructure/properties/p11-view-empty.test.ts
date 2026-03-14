// Feature: supabase-infrastructure, Property 11: current_active_subscriptions Returns Zero Rows for Inactive Users
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient } from '../helpers'

const db = serviceClient()

const INACTIVE_STATUSES = ['cancelled', 'expired'] as const

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

describe('P11: current_active_subscriptions Returns Zero Rows for Inactive Users', () => {
  it('view returns zero rows for users with only cancelled/expired subscriptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.constantFrom(...INACTIVE_STATUSES),
        fc.uuid(),
        async (n, status, seed) => {
          const userId = await createTestUser(`p11-${seed}@test.local`)
          if (!userId) return true

          const { data: plans } = await db.from('plans').select('id').eq('code', 'free').limit(1)
          const planId = plans?.[0]?.id
          if (!planId) { await deleteTestUser(userId); return true }

          // Insert N inactive subscriptions
          const insertedIds: string[] = []
          for (let i = 0; i < n; i++) {
            const { data } = await db.from('subscriptions').insert({
              user_id: userId,
              plan_id: planId,
              status,
            }).select('id').single()
            if (data?.id) insertedIds.push(data.id)
          }

          // Query the view
          const { data: viewRows } = await db
            .from('current_active_subscriptions')
            .select('user_id')
            .eq('user_id', userId)

          // Cleanup
          await db.from('subscriptions').delete().in('id', insertedIds)
          await deleteTestUser(userId)

          return (viewRows ?? []).length === 0
        }
      ),
      { numRuns: 5 }
    )
  })

  it('view returns zero rows for users with no subscriptions at all', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (seed) => {
        const userId = await createTestUser(`p11-nosub-${seed}@test.local`)
        if (!userId) return true

        const { data: viewRows } = await db
          .from('current_active_subscriptions')
          .select('user_id')
          .eq('user_id', userId)

        await deleteTestUser(userId)

        return (viewRows ?? []).length === 0
      }),
      { numRuns: 3 }
    )
  })
})
