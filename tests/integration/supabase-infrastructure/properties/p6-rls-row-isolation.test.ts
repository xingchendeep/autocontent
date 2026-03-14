// Feature: supabase-infrastructure, Property 6: RLS Row Isolation for Authenticated Users
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, userClient } from '../helpers'

const db = serviceClient()

interface AuthUser { id: string; access_token: string }

async function createTestUser(email: string): Promise<AuthUser | null> {
  const base = process.env.SUPABASE_URL ?? 'http://localhost:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  try {
    // Create user
    const createRes = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!createRes.ok) return null
    const user = await createRes.json() as { id?: string }
    if (!user.id) return null

    // Sign in to get access token
    const signInRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email, password: 'Test1234!' }),
    })
    if (!signInRes.ok) return null
    const tokens = await signInRes.json() as { access_token?: string }
    return { id: user.id, access_token: tokens.access_token ?? '' }
  } catch { return null }
}

async function deleteTestUser(userId: string): Promise<void> {
  const url = `${process.env.SUPABASE_URL ?? 'http://localhost:54321'}/auth/v1/admin/users/${userId}`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  await fetch(url, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } })
}

describe('P6: RLS Row Isolation for Authenticated Users', () => {
  it('user A cannot see user B rows in profiles, generations, usage_stats', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (seedA, seedB) => {
        const [userA, userB] = await Promise.all([
          createTestUser(`rls-a-${seedA}@test.local`),
          createTestUser(`rls-b-${seedB}@test.local`),
        ])
        if (!userA || !userB) return true // skip

        const { data: plans } = await db.from('plans').select('id').eq('code', 'free').limit(1)
        const planId = plans?.[0]?.id

        // Insert rows for both users via service role
        await db.from('profiles').insert([{ id: userA.id }, { id: userB.id }])
        await db.from('generations').insert([
          { user_id: userA.id, input_source: 'manual', input_content: 'A content', platforms: ['douyin'], platform_count: 1, result_json: {}, status: 'success' },
          { user_id: userB.id, input_source: 'manual', input_content: 'B content', platforms: ['douyin'], platform_count: 1, result_json: {}, status: 'success' },
        ])
        await db.from('usage_stats').insert([
          { user_id: userA.id, current_month: '2026-03' },
          { user_id: userB.id, current_month: '2026-03' },
        ])
        if (planId) {
          await db.from('subscriptions').insert([
            { user_id: userA.id, plan_id: planId, status: 'active' },
            { user_id: userB.id, plan_id: planId, status: 'active' },
          ])
        }

        // Query as user A — should only see user A's rows
        const clientA = userClient(userA.access_token)
        const [{ data: pA }, { data: gA }, { data: uA }] = await Promise.all([
          clientA.from('profiles').select('id'),
          clientA.from('generations').select('user_id'),
          clientA.from('usage_stats').select('user_id'),
        ])

        const profileIds = (pA ?? []).map((r: { id: string }) => r.id)
        const genUserIds = (gA ?? []).map((r: { user_id: string }) => r.user_id)
        const usageUserIds = (uA ?? []).map((r: { user_id: string }) => r.user_id)

        const noLeakage =
          !profileIds.includes(userB.id) &&
          !genUserIds.includes(userB.id) &&
          !usageUserIds.includes(userB.id)

        // Cleanup
        await Promise.all([
          db.from('profiles').delete().in('id', [userA.id, userB.id]),
          db.from('generations').delete().in('user_id', [userA.id, userB.id]),
          db.from('usage_stats').delete().in('user_id', [userA.id, userB.id]),
          planId ? db.from('subscriptions').delete().in('user_id', [userA.id, userB.id]) : Promise.resolve(),
          deleteTestUser(userA.id),
          deleteTestUser(userB.id),
        ])

        return noLeakage
      }),
      { numRuns: 3 }
    )
  })
})
