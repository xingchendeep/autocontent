import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

const SUPABASE_URL      = process.env.SUPABASE_URL              ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const WEBHOOK_SECRET    = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? 'test-secret'
const UPSTASH_URL       = process.env.UPSTASH_REDIS_REST_URL    ?? ''
const UPSTASH_TOKEN     = process.env.UPSTASH_REDIS_REST_TOKEN  ?? ''
const APP_URL           = process.env.APP_URL                   ?? 'http://localhost:3000'

export { APP_URL }

/** Service-role Supabase client — bypasses RLS, used for setup/teardown/verification */
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

/** Deletes a Supabase auth user (cascades to all related rows via FK) */
export async function deleteTestUser(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
}

/**
 * Sets the plan for a test user by upserting a subscription row.
 * Uses the service role client to bypass RLS.
 */
export async function setUserPlan(userId: string, planCode: string): Promise<void> {
  const db = serviceClient()
  const { data: plan } = await db
    .from('plans')
    .select('id')
    .eq('code', planCode)
    .single()
  if (!plan) return

  const providerSubId = `test_sub_${userId}`

  // Check if subscription already exists (partial unique index prevents PostgREST upsert)
  const { data: existing } = await db
    .from('subscriptions')
    .select('id')
    .eq('provider_subscription_id', providerSubId)
    .maybeSingle()

  if (existing) {
    await db.from('subscriptions').update({
      plan_id: plan.id,
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', existing.id)
  } else {
    await db.from('subscriptions').insert({
      user_id: userId,
      plan_id: plan.id,
      provider: 'lemonsqueezy',
      provider_subscription_id: providerSubId,
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }
}

/**
 * Deletes all Redis rate limit keys matching the given scope pattern.
 * Uses the Upstash REST API SCAN + DEL pattern.
 * No-ops silently if UPSTASH_REDIS_REST_URL is not configured.
 */
export async function resetRateLimitKeys(scope: 'generate' | 'extract'): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return

  try {
    // SCAN for matching keys
    const scanRes = await fetch(`${UPSTASH_URL}/scan/0/match/rl:${scope}:*`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    })
    if (!scanRes.ok) return
    const scanData = (await scanRes.json()) as { result?: [string, string[]] }
    const keys = scanData.result?.[1] ?? []
    if (keys.length === 0) return

    // DEL all matched keys
    await fetch(`${UPSTASH_URL}/del/${keys.join('/')}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    })
  } catch {
    // Non-fatal — test environment may not have Redis configured
  }
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

/** Cleans up webhook_events and subscriptions rows for a user */
export async function cleanupPaymentsData(userId?: string): Promise<void> {
  const db = serviceClient()
  await db.from('webhook_events').delete().eq('provider', 'lemonsqueezy')
  if (userId) {
    await db.from('subscriptions').delete().eq('user_id', userId)
  }
}

/** Inserts a generation row directly for testing history/usage endpoints */
export async function insertTestGeneration(userId: string): Promise<void> {
  const db = serviceClient()
  await db.from('generations').insert({
    user_id: userId,
    input_source: 'manual',
    input_content: 'test content',
    platforms: ['douyin'],
    platform_count: 1,
    result_json: {},
    prompt_version: 'v1',
    model_name: 'test-model',
    tokens_input: 10,
    tokens_output: 20,
    duration_ms: 500,
    status: 'success',
  })
}
