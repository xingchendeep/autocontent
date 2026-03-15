/**
 * Integration tests for POST /api/webhooks/lemon
 * Covers: signature verification, idempotency, subscription state transitions, audit logging.
 *
 * Requires:
 *   - Local Supabase running (pnpm supabase:start)
 *   - LEMONSQUEEZY_WEBHOOK_SECRET set (defaults to 'test-secret')
 *   - APP_URL pointing to a running Next.js instance
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  cleanupPaymentsData,
  serviceClient,
  signWebhookPayload,
  buildWebhookPayload,
  APP_URL,
} from './helpers'

const WEBHOOK_URL = `${APP_URL}/api/webhooks/lemon`

async function postWebhook(payload: string, signature: string) {
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': signature,
    },
    body: payload,
  })
}

describe('POST /api/webhooks/lemon — integration', () => {
  let user: { id: string; accessToken: string } | null = null

  beforeAll(async () => {
    user = await createTestUser(`webhook-${Date.now()}@test.local`)
  })

  afterAll(async () => {
    if (user) {
      await cleanupPaymentsData(user.id)
      await deleteTestUser(user.id)
    }
  })

  beforeEach(async () => {
    if (user) await cleanupPaymentsData(user.id)
  })

  it('无效签名返回 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const payload = buildWebhookPayload('subscription_created', 'evt_bad_sig', user?.id ?? 'x')
    const res = await postWebhook(payload, 'invalid_signature')

    expect(res.status).toBe(401)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('有效 subscription_created 事件创建 status=active 的订阅行', async () => {
    if (!user) return

    const eventId = `evt_created_${Date.now()}`
    const subId = `sub_${Date.now()}`
    const payload = buildWebhookPayload('subscription_created', eventId, user.id, subId)
    const sig = signWebhookPayload(payload)

    const res = await postWebhook(payload, sig)
    expect(res.status).toBe(200)

    const db = serviceClient()
    const { data } = await db
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .eq('provider_subscription_id', subId)
      .maybeSingle()

    expect(data?.status).toBe('active')
  })

  it('同一 event_id 发送两次，webhook_events 只有一行，第二次返回 { processed: true }', async () => {
    if (!user) return

    const eventId = `evt_idem_${Date.now()}`
    const payload = buildWebhookPayload('subscription_created', eventId, user.id)
    const sig = signWebhookPayload(payload)

    const res1 = await postWebhook(payload, sig)
    expect(res1.status).toBe(200)

    const res2 = await postWebhook(payload, sig)
    expect(res2.status).toBe(200)
    const json2 = (await res2.json()) as { processed?: boolean }
    expect(json2.processed).toBe(true)

    const db = serviceClient()
    const { data } = await db
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
    expect(data?.length).toBe(1)
  })

  it('有效 subscription_cancelled 事件将 status 设为 cancelled 并记录 cancelled_at', async () => {
    if (!user) return

    const subId = `sub_cancel_${Date.now()}`

    // First create the subscription
    const createPayload = buildWebhookPayload('subscription_created', `evt_c1_${Date.now()}`, user.id, subId)
    await postWebhook(createPayload, signWebhookPayload(createPayload))

    // Then cancel it
    const cancelPayload = buildWebhookPayload('subscription_cancelled', `evt_c2_${Date.now()}`, user.id, subId, 'cancelled')
    const res = await postWebhook(cancelPayload, signWebhookPayload(cancelPayload))
    expect(res.status).toBe(200)

    const db = serviceClient()
    const { data } = await db
      .from('subscriptions')
      .select('status, cancelled_at')
      .eq('user_id', user.id)
      .eq('provider_subscription_id', subId)
      .maybeSingle()

    expect(data?.status).toBe('cancelled')
    expect(data?.cancelled_at).toBeTruthy()
  })

  it('成功处理 subscription_created 后，audit_logs 有 SUBSCRIPTION_CREATED 行', async () => {
    if (!user) return

    const eventId = `evt_audit_${Date.now()}`
    const subId = `sub_audit_${Date.now()}`
    const payload = buildWebhookPayload('subscription_created', eventId, user.id, subId)
    const sig = signWebhookPayload(payload)

    const res = await postWebhook(payload, sig)
    expect(res.status).toBe(200)

    // Give the fire-and-forget audit log a moment to write
    await new Promise((r) => setTimeout(r, 300))

    const db = serviceClient()
    const { data } = await db
      .from('audit_logs')
      .select('action, user_id')
      .eq('action', 'SUBSCRIPTION_CREATED')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(data?.action).toBe('SUBSCRIPTION_CREATED')
    expect(data?.user_id).toBe(user.id)
  })
})
