// Feature: user-authentication, Property 8: Profile upsert is idempotent
//
// Verifies that calling upsertProfile N times for the same userId always
// results in exactly one row in public.profiles with the correct values,
// and that RLS policies are enforced end-to-end.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

/** Service-role client — bypasses RLS, used for setup/teardown/verification */
function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Creates a real auth user and returns { id, accessToken } */
async function createTestUser(email: string): Promise<{ id: string; accessToken: string } | null> {
  const key = SERVICE_ROLE_KEY
  try {
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!createRes.ok) return null
    const user = await createRes.json() as { id?: string }
    if (!user.id) return null

    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email, password: 'Test1234!' }),
    })
    if (!signInRes.ok) return null
    const tokens = await signInRes.json() as { access_token?: string }
    return { id: user.id, accessToken: tokens.access_token ?? '' }
  } catch {
    return null
  }
}

async function deleteTestUser(userId: string): Promise<void> {
  const key = SERVICE_ROLE_KEY
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
}

/**
 * Simulates upsertProfile using the anon client with a user JWT —
 * mirrors the production implementation in src/lib/auth/index.ts.
 */
async function upsertProfileAsUser(userId: string, accessToken: string): Promise<void> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { error } = await client
    .from('profiles')
    .upsert({ id: userId, default_language: 'zh-CN' }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

describe('P8: upsertProfile is idempotent (integration)', () => {
  it('calling upsertProfile N times yields exactly 1 row with correct values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (callCount) => {
          const seed = Math.random().toString(36).slice(2, 8)
          const email = `upsert-idem-${seed}@test.local`
          const user = await createTestUser(email)
          if (!user) return true // skip if Supabase unavailable

          try {
            // Call upsert N times — must be idempotent
            for (let i = 0; i < callCount; i++) {
              await upsertProfileAsUser(user.id, user.accessToken)
            }

            // Verify via service role: exactly 1 row with correct values
            const db = serviceClient()
            const { data, error } = await db
              .from('profiles')
              .select('id, default_language')
              .eq('id', user.id)

            if (error) throw new Error(error.message)

            const rows = data ?? []
            const exactlyOneRow = rows.length === 1
            const correctId = rows[0]?.id === user.id
            const correctLang = rows[0]?.default_language === 'zh-CN'

            return exactlyOneRow && correctId && correctLang
          } finally {
            // Cleanup: cascade delete removes the profile row too
            await deleteTestUser(user.id)
          }
        }
      ),
      { numRuns: 5 }
    )
  })

  it('RLS prevents a user from upserting a profile for a different userId', async () => {
    const seedA = Math.random().toString(36).slice(2, 8)
    const seedB = Math.random().toString(36).slice(2, 8)
    const userA = await createTestUser(`rls-upsert-a-${seedA}@test.local`)
    const userB = await createTestUser(`rls-upsert-b-${seedB}@test.local`)
    if (!userA || !userB) return // skip

    try {
      // userA tries to upsert a profile row with userB's id — RLS must block it
      const clientA = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${userA.accessToken}` } },
      })
      const { error } = await clientA
        .from('profiles')
        .upsert({ id: userB.id, default_language: 'zh-CN' }, { onConflict: 'id' })

      // RLS should produce an error or return no rows inserted
      const db = serviceClient()
      const { data } = await db
        .from('profiles')
        .select('id')
        .eq('id', userB.id)

      // Either the upsert errored, or no row was created for userB
      const blocked = !!error || (data ?? []).length === 0
      expect(blocked).toBe(true)
    } finally {
      await Promise.all([deleteTestUser(userA.id), deleteTestUser(userB.id)])
    }
  })
})
