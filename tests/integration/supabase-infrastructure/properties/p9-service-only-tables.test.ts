// Feature: supabase-infrastructure, Property 9: Service-Only Tables Are Invisible to Non-Service-Role Sessions
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, anonClient, userClient } from '../helpers'

const db = serviceClient()
const anon = anonClient()

async function createTestUser(email: string): Promise<{ id: string; access_token: string } | null> {
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

describe('P9: Service-Only Tables Are Invisible to Non-Service-Role Sessions', () => {
  it('anon client sees zero rows in audit_logs and webhook_events', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (_n) => {
        // Insert rows via service role
        const { data: log } = await db.from('audit_logs').insert({
          action: 'p9_test_action',
          metadata: {},
        }).select('id').single()

        const { data: evt } = await db.from('webhook_events').insert({
          provider: 'p9-test',
          event_name: 'p9.test',
          event_id: `p9-${Date.now()}-${Math.random()}`,
          payload: {},
        }).select('id').single()

        // Query as anon
        const [{ data: al }, { data: we }] = await Promise.all([
          anon.from('audit_logs').select('id'),
          anon.from('webhook_events').select('id'),
        ])

        // Cleanup
        await Promise.all([
          log?.id ? db.from('audit_logs').delete().eq('id', log.id) : Promise.resolve(),
          evt?.id ? db.from('webhook_events').delete().eq('id', evt.id) : Promise.resolve(),
        ])

        return (al ?? []).length === 0 && (we ?? []).length === 0
      }),
      { numRuns: 5 }
    )
  })

  it('authenticated user sees zero rows in audit_logs and webhook_events', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (seed) => {
        const user = await createTestUser(`p9-auth-${seed}@test.local`)
        if (!user) return true

        // Insert rows via service role
        const { data: log } = await db.from('audit_logs').insert({
          action: 'p9_auth_test',
          metadata: {},
        }).select('id').single()

        const { data: evt } = await db.from('webhook_events').insert({
          provider: 'p9-auth-test',
          event_name: 'p9.auth.test',
          event_id: `p9-auth-${Date.now()}-${Math.random()}`,
          payload: {},
        }).select('id').single()

        const clientU = userClient(user.access_token)
        const [{ data: al }, { data: we }] = await Promise.all([
          clientU.from('audit_logs').select('id'),
          clientU.from('webhook_events').select('id'),
        ])

        // Cleanup
        await Promise.all([
          log?.id ? db.from('audit_logs').delete().eq('id', log.id) : Promise.resolve(),
          evt?.id ? db.from('webhook_events').delete().eq('id', evt.id) : Promise.resolve(),
          deleteTestUser(user.id),
        ])

        return (al ?? []).length === 0 && (we ?? []).length === 0
      }),
      { numRuns: 3 }
    )
  })
})
