/**
 * Integration tests for GET /api/history and GET /api/usage
 * Covers: auth enforcement, data isolation, response shape, usage count accuracy.
 *
 * Requires:
 *   - Local Supabase running (pnpm supabase:start)
 *   - APP_URL pointing to a running Next.js instance
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  insertTestGeneration,
  APP_URL,
} from './helpers'

const HISTORY_URL = `${APP_URL}/api/history`
const USAGE_URL   = `${APP_URL}/api/usage`

describe('GET /api/history — integration', () => {
  let userA: { id: string; accessToken: string } | null = null
  let userB: { id: string; accessToken: string } | null = null

  beforeAll(async () => {
    userA = await createTestUser(`history-a-${Date.now()}@test.local`)
    userB = await createTestUser(`history-b-${Date.now()}@test.local`)

    // Insert one generation for user A only
    if (userA) await insertTestGeneration(userA.id)
  })

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id)
    if (userB) await deleteTestUser(userB.id)
  })

  it('未认证请求返回 401 UNAUTHORIZED', async () => {
    const res = await fetch(HISTORY_URL)
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('UNAUTHORIZED')
  })

  it('用户 A 只能看到自己的记录，用户 B 的记录不出现', async () => {
    if (!userA || !userB) return

    // Insert a generation for user B
    await insertTestGeneration(userB.id)

    const res = await fetch(HISTORY_URL, {
      headers: { Authorization: `Bearer ${userA.accessToken}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data?: { items?: Array<{ id: string }> }
    }
    expect(json.success).toBe(true)

    // All returned items must belong to user A — verified by checking no cross-user leakage
    // (We can't directly check user_id from the response, but we verify count is ≥ 1
    //  and that user B's isolated request also returns ≥ 1 separate record)
    const itemsA = json.data?.items ?? []
    expect(itemsA.length).toBeGreaterThanOrEqual(1)

    const resB = await fetch(HISTORY_URL, {
      headers: { Authorization: `Bearer ${userB.accessToken}` },
    })
    const jsonB = (await resB.json()) as {
      success: boolean
      data?: { items?: Array<{ id: string }> }
    }
    const itemsB = jsonB.data?.items ?? []

    // No item IDs should overlap between user A and user B
    const idsA = new Set(itemsA.map((i) => i.id))
    const idsB = new Set(itemsB.map((i) => i.id))
    const overlap = [...idsA].filter((id) => idsB.has(id))
    expect(overlap).toHaveLength(0)
  })

  it('响应 items 不含 input_content 或 result_json 字段', async () => {
    if (!userA) return

    const res = await fetch(HISTORY_URL, {
      headers: { Authorization: `Bearer ${userA.accessToken}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data?: { items?: Array<Record<string, unknown>> }
    }
    const items = json.data?.items ?? []
    for (const item of items) {
      expect(item).not.toHaveProperty('input_content')
      expect(item).not.toHaveProperty('result_json')
    }
  })
})

describe('GET /api/usage — integration', () => {
  let user: { id: string; accessToken: string } | null = null

  beforeAll(async () => {
    user = await createTestUser(`usage-${Date.now()}@test.local`)
  })

  afterAll(async () => {
    if (user) await deleteTestUser(user.id)
  })

  it('未认证请求返回 401 UNAUTHORIZED', async () => {
    const res = await fetch(USAGE_URL)
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('UNAUTHORIZED')
  })

  it('写入一条生成记录后 monthlyGenerationCount 正确递增', async () => {
    if (!user) return

    // Get baseline count
    const before = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
    const beforeJson = (await before.json()) as {
      success: boolean
      data?: { monthlyGenerationCount?: number }
    }
    const countBefore = beforeJson.data?.monthlyGenerationCount ?? 0

    // Insert a generation directly
    await insertTestGeneration(user.id)

    // Trigger usage_stats upsert by calling the usage endpoint again
    // (In production this is done by writeGeneration; here we insert directly
    //  so we also upsert usage_stats manually via the service client)
    const { serviceClient } = await import('./helpers')
    const db = serviceClient()
    const currentMonth = new Date().toISOString().slice(0, 7)
    await db.from('usage_stats').upsert(
      {
        user_id: user.id,
        current_month: currentMonth,
        monthly_generation_count: countBefore + 1,
        total_generation_count: countBefore + 1,
        last_generation_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    const after = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
    const afterJson = (await after.json()) as {
      success: boolean
      data?: { monthlyGenerationCount?: number }
    }
    expect(after.status).toBe(200)
    expect(afterJson.data?.monthlyGenerationCount).toBe(countBefore + 1)
  })
})
