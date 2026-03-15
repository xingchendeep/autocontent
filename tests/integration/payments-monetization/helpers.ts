import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

const SUPABASE_URL        = process.env.SUPABASE_URL              ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const WEBHOOK_SECRET      = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? 'test-secret'

/** Service-role client — bypasses RLS, used for setup/teardown/verification */
export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Creates a real Supabase auth user and returns { id, accessToken }, or null on failure */
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

/** Deletes a Supabase auth user (cascades to all related rows) */
export async function deleteTestUser(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
}

/** Removes webhook_events and subscriptions rows for cleanup */
export async function cleanupPaymentsData(userId?: string): Promise<void> {
  const db = serviceClient()
  const ops: Promise<unknown>[] = [
    db.from('webhook_events').delete().eq('provider', 'lemonsqueezy'),
  ]
  if (userId) {
    ops.push(db.from('subscriptions').delete().eq('user_id', userId))
  }
  await Promise.all(ops)
}

/**
 * Signs a webhook payload with HMAC-SHA256 using the test secret.
 * Returns the hex digest to use as the `x-signature` header value.
 */
export function signWebhookPayload(payload: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')
}

/**
 * Builds a minimal Lemon Squeezy webhook event payload.
 */
export function buildWebhookPayload(
  eventName: string,
  eventId: string,
  userId: string,
  subscriptionId = 'sub_test_001',
  status = 'active',
): string {
  return JSON.stringify({
    meta: {
      event_name: eventName,
      custom_data: { user_id: userId },
    },
    data: {
      id: eventId,
      attributes: {
        status,
        first_subscription_item: { subscription_id: subscriptionId },
        created_at: new Date().toISOString(),
        renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
  })
}
