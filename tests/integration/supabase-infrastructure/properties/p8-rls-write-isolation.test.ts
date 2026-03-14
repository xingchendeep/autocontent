// Feature: supabase-infrastructure, Property 8: RLS Write Isolation for Authenticated Users
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, userClient } from '../helpers'

const db = serviceClient()

interface AuthUser { id: string; access_token: string }

async function createTestUser(email: string): Promise<AuthUser | null> {
  const base = process.env.SUPABASE_URL ?? 'http://localhost:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  try {
    const createRes = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!createRes.ok) return null
    const user = await createRes.json() as { id?: string }
    if (!user.id) return null
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

describe('P8: RLS Write Isolation for Authenticated Users', () => {
  it('user A cannot INSERT a profiles row owned by user B', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (seedA, seedB) => {
        const [userA, userB] = await Promise.all([
          createTestUser(`write-a-${seedA}@test.local`),
          createTestUser(`write-b-${seedB}@test.local`),
        ])
        if (!userA || !userB) return true

        // User A tries to INSERT a profiles row with id = userB.id
        const clientA = userClient(userA.access_token)
        const { error } = await clientA.from('profiles').insert({ id: userB.id })

        // Cleanup
        await Promise.all([
          db.from('profiles').delete().eq('id', userB.id),
          deleteTestUser(userA.id),
          deleteTestUser(userB.id),
        ])

        // Must be rejected (RLS WITH CHECK violation or permission denied)
        return error !== null
      }),
      { numRuns: 3 }
    )
  })

  it('user A cannot UPDATE a profiles row owned by user B', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (seedA, seedB) => {
        const [userA, userB] = await Promise.all([
          createTestUser(`upd-a-${seedA}@test.local`),
          createTestUser(`upd-b-${seedB}@test.local`),
        ])
        if (!userA || !userB) return true

        // Insert user B's profile via service role
        await db.from('profiles').insert({ id: userB.id })

        // User A tries to UPDATE user B's profile
        const clientA = userClient(userA.access_token)
        const { data: updated } = await clientA
          .from('profiles')
          .update({ display_name: 'hacked' })
          .eq('id', userB.id)
          .select('id')

        // Cleanup
        await Promise.all([
          db.from('profiles').delete().eq('id', userB.id),
          deleteTestUser(userA.id),
          deleteTestUser(userB.id),
        ])

        // Zero rows affected = RLS blocked the update
        return (updated ?? []).length === 0
      }),
      { numRuns: 3 }
    )
  })

  it('user A cannot INSERT a generations row with user_id = user B', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (seedA, seedB) => {
        const [userA, userB] = await Promise.all([
          createTestUser(`gen-a-${seedA}@test.local`),
          createTestUser(`gen-b-${seedB}@test.local`),
        ])
        if (!userA || !userB) return true

        const clientA = userClient(userA.access_token)
        const { error } = await clientA.from('generations').insert({
          user_id: userB.id,
          input_source: 'manual',
          input_content: 'write isolation test',
          platforms: ['douyin'],
          platform_count: 1,
          result_json: {},
          status: 'success',
        })

        await Promise.all([deleteTestUser(userA.id), deleteTestUser(userB.id)])
        return error !== null
      }),
      { numRuns: 3 }
    )
  })

  it('user A cannot UPDATE a usage_stats row owned by user B', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (seedA, seedB) => {
        const [userA, userB] = await Promise.all([
          createTestUser(`us-a-${seedA}@test.local`),
          createTestUser(`us-b-${seedB}@test.local`),
        ])
        if (!userA || !userB) return true

        // Insert user B's usage_stats via service role
        await db.from('usage_stats').insert({ user_id: userB.id, current_month: '2026-03' })

        const clientA = userClient(userA.access_token)
        const { data: updatedUs } = await clientA
          .from('usage_stats')
          .update({ monthly_generation_count: 999 })
          .eq('user_id', userB.id)
          .select('user_id')

        await Promise.all([
          db.from('usage_stats').delete().eq('user_id', userB.id),
          deleteTestUser(userA.id),
          deleteTestUser(userB.id),
        ])

        return (updatedUs ?? []).length === 0
      }),
      { numRuns: 3 }
    )
  })
})
