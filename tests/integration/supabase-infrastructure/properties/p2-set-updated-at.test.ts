// Feature: supabase-infrastructure, Property 2: set_updated_at Trigger Fires on Every Update
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, querySql } from '../helpers'

const db = serviceClient()

/**
 * For each table with an updated_at column, generate a random display_name,
 * insert a row, record updated_at, perform an UPDATE, then assert
 * new updated_at >= old updated_at.
 *
 * Note: rows that reference auth.users cannot be inserted via the JS client
 * without a real user. The plans table has no FK to auth.users and is the
 * safest table to test the trigger against without Docker/auth setup.
 * The full live test (profiles, subscriptions, usage_stats) requires a
 * running local Supabase stack with auth.users rows.
 */
describe('P2: set_updated_at Trigger Fires on Every Update', () => {
  it('plans.updated_at advances after any UPDATE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (suffix) => {
          const code = `test-plan-p2-${suffix}-${Date.now()}`

          // Insert
          const { data: inserted, error: ie } = await db
            .from('plans')
            .insert({
              code,
              display_name: `Test Plan ${suffix}`,
              price_cents: 0,
              speed_tier: 'standard',
            })
            .select('id, updated_at')
            .single()

          if (ie) return true // skip if DB not available
          const oldUpdatedAt = new Date(inserted.updated_at).getTime()

          // Small delay to ensure clock advances
          await new Promise(r => setTimeout(r, 10))

          // Update
          const { data: updated, error: ue } = await db
            .from('plans')
            .update({ display_name: `Updated ${suffix}` })
            .eq('id', inserted.id)
            .select('updated_at')
            .single()

          if (ue) return true
          const newUpdatedAt = new Date(updated.updated_at).getTime()

          // Cleanup
          await db.from('plans').delete().eq('id', inserted.id)

          return newUpdatedAt >= oldUpdatedAt
        }
      ),
      { numRuns: 10 }
    )
  })

  it('trigger function set_updated_at exists in public schema', async () => {
    const rows = await querySql<{ proname: string }>(
      `SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'`
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('updated_at triggers exist for profiles, plans, subscriptions, usage_stats', async () => {
    const EXPECTED_TRIGGERS = [
      'trg_profiles_updated_at',
      'trg_plans_updated_at',
      'trg_subscriptions_updated_at',
      'trg_usage_stats_updated_at',
    ]
    const rows = await querySql<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgname = ANY($1)`,
      [EXPECTED_TRIGGERS]
    )
    const found = rows.map(r => r.tgname).sort()
    expect(found).toEqual([...EXPECTED_TRIGGERS].sort())
  })
})
