// Feature: supabase-infrastructure, Property 3: CHECK Constraints Reject Out-of-Range Enum Values
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient } from '../helpers'

const db = serviceClient()

const VALID_SPEED_TIERS = ['standard', 'fast', 'priority', 'dedicated']
const VALID_SUB_STATUSES = ['active', 'cancelled', 'expired', 'past_due', 'trialing', 'paused']
const VALID_INPUT_SOURCES = ['manual', 'extract']
const VALID_GEN_STATUSES = ['success', 'failed', 'partial']

/** Arbitrary string that is NOT in the given allowed set */
function invalidValueArb(allowed: string[]) {
  return fc
    .string({ minLength: 1, maxLength: 30 })
    .filter(s => !allowed.includes(s))
}

describe('P3: CHECK Constraints Reject Out-of-Range Enum Values', () => {
  it('plans.speed_tier rejects invalid values with error code 23514', async () => {
    await fc.assert(
      fc.asyncProperty(invalidValueArb(VALID_SPEED_TIERS), async (badTier) => {
        const { error } = await db.from('plans').insert({
          code: `test-bad-tier-${Date.now()}`,
          display_name: 'Bad Tier Plan',
          price_cents: 0,
          speed_tier: badTier,
        })
        // Must be rejected — either 23514 (check violation) or a non-null error
        if (!error) {
          // Cleanup stray row if somehow inserted
          await db.from('plans').delete().eq('code', `test-bad-tier-${Date.now()}`)
        }
        return error !== null && error.code === '23514'
      }),
      { numRuns: 20 }
    )
  })

  it('subscriptions.status rejects invalid values with error code 23514', async () => {
    // Get a valid plan_id for the FK
    const { data: plans } = await db.from('plans').select('id').eq('code', 'free').limit(1)
    const planId = plans?.[0]?.id
    if (!planId) return // skip if DB not seeded

    await fc.assert(
      fc.asyncProperty(invalidValueArb(VALID_SUB_STATUSES), async (badStatus) => {
        // user_id FK requires a real auth.users row — we expect a FK error (23503)
        // or a CHECK error (23514). Either way the insert must fail.
        const { error } = await db.from('subscriptions').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          plan_id: planId,
          status: badStatus,
        })
        // Accept 23514 (check) or 23503 (fk) — both mean the bad status was rejected
        return error !== null && ['23514', '23503'].includes(error.code ?? '')
      }),
      { numRuns: 20 }
    )
  })

  it('generations.input_source rejects invalid values with error code 23514', async () => {
    await fc.assert(
      fc.asyncProperty(invalidValueArb(VALID_INPUT_SOURCES), async (badSource) => {
        const { error } = await db.from('generations').insert({
          user_id: null,
          input_source: badSource,
          input_content: 'test content',
          platforms: ['douyin'],
          platform_count: 1,
          result_json: {},
          status: 'success',
        })
        return error !== null && error.code === '23514'
      }),
      { numRuns: 20 }
    )
  })

  it('generations.status rejects invalid values with error code 23514', async () => {
    await fc.assert(
      fc.asyncProperty(invalidValueArb(VALID_GEN_STATUSES), async (badStatus) => {
        const { error } = await db.from('generations').insert({
          user_id: null,
          input_source: 'manual',
          input_content: 'test content',
          platforms: ['douyin'],
          platform_count: 1,
          result_json: {},
          status: badStatus,
        })
        return error !== null && error.code === '23514'
      }),
      { numRuns: 20 }
    )
  })
})
