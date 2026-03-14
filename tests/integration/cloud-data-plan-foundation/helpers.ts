import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Service-role client — bypasses RLS, used for setup/teardown/verification */
export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Creates a real Supabase auth user and returns { id, accessToken }, or null if unavailable */
export async function createTestUser(
  email: string,
): Promise<{ id: string; accessToken: string } | null> {
  try {
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
    })
    if (!createRes.ok) return null
    const user = (await createRes.json()) as { id?: string }
    if (!user.id) return null

    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY },
      body: JSON.stringify({ email, password: 'Test1234!' }),
    })
    if (!signInRes.ok) return null
    const tokens = (await signInRes.json()) as { access_token?: string }
    return { id: user.id, accessToken: tokens.access_token ?? '' }
  } catch {
    return null
  }
}

/** Deletes a Supabase auth user (cascades to profiles, generations, usage_stats) */
export async function deleteTestUser(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
}

/** Removes all generations and usage_stats rows for the given userId */
export async function cleanupUserData(userId: string): Promise<void> {
  const db = serviceClient()
  await Promise.all([
    db.from('generations').delete().eq('user_id', userId),
    db.from('usage_stats').delete().eq('user_id', userId),
  ])
}
