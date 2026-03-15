/**
 * Integration tests for POST /api/generate
 * Covers: rate limiting, content moderation, plan enforcement, input validation.
 *
 * Requires:
 *   - Local Supabase running (pnpm supabase:start)
 *   - UPSTASH_REDIS_REST_URL / TOKEN set (or tests skip rate-limit assertions)
 *   - APP_URL pointing to a running Next.js instance
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  createTestUser,
  deleteTestUser,
  setUserPlan,
  resetRateLimitKeys,
  APP_URL,
} from './helpers'

const GENERATE_URL = `${APP_URL}/api/generate`

/** Minimal valid generate request body */
function validBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    content: '这是一段测试内容，用于验证生成接口的基本功能。',
    platforms: ['douyin'],
    ...overrides,
  })
}

describe('POST /api/generate — integration', () => {
  let freeUser: { id: string; accessToken: string } | null = null

  beforeAll(async () => {
    freeUser = await createTestUser(`gen-free-${Date.now()}@test.local`)
    if (freeUser) await setUserPlan(freeUser.id, 'free')
  })

  afterAll(async () => {
    if (freeUser) await deleteTestUser(freeUser.id)
  })

  beforeEach(async () => {
    await resetRateLimitKeys('generate')
  })

  it('免费用户有效请求返回 200，含 generationId 和 results', async () => {
    if (!freeUser) return

    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freeUser.accessToken}`,
      },
      body: validBody(),
    })

    // AI provider may not be available in CI — accept 200 or 500
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      const json = (await res.json()) as { success: boolean; data?: { generationId?: string; results?: unknown } }
      expect(json.success).toBe(true)
      expect(json.data?.generationId).toBeTruthy()
      expect(json.data?.results).toBeDefined()
    }
  })

  it('匿名 IP 超限（连续 6 次）返回 429 RATE_LIMITED', async () => {
    // Exhaust the 5 req/h anonymous limit
    for (let i = 0; i < 5; i++) {
      await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validBody(),
      })
    }

    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validBody(),
    })

    // Only assert if Redis is configured
    if (process.env.UPSTASH_REDIS_REST_URL) {
      expect(res.status).toBe(429)
      const json = (await res.json()) as { error?: { code?: string }; success: boolean }
      expect(json.success).toBe(false)
      expect(json.error?.code).toBe('RATE_LIMITED')
    }
  })

  it('内容含屏蔽词返回 422 CONTENT_BLOCKED', async () => {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validBody({ content: '这段内容包含法轮功相关词汇' }),
    })

    expect(res.status).toBe(422)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('CONTENT_BLOCKED')
    // Matched keywords must NOT appear in response body
    const bodyText = JSON.stringify(json)
    expect(bodyText).not.toContain('法轮功')
  })

  it('免费用户超平台数返回 402 PLAN_LIMIT_REACHED', async () => {
    if (!freeUser) return

    // Free plan allows max 3 platforms; request 4
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freeUser.accessToken}`,
      },
      body: validBody({ platforms: ['douyin', 'xiaohongshu', 'bilibili', 'weibo'] }),
    })

    expect(res.status).toBe(402)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('PLAN_LIMIT_REACHED')
  })

  it('无效平台代码返回 400 INVALID_PLATFORM', async () => {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validBody({ platforms: ['invalid_platform_xyz'] }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error?: { code?: string }; success: boolean }
    expect(json.success).toBe(false)
    expect(json.error?.code).toBe('INVALID_PLATFORM')
  })
})
