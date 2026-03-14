// Feature: supabase-infrastructure, Property 7: RLS Anon Isolation
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serviceClient, anonClient } from '../helpers'

const db = serviceClient()
const anon = anonClient()

describe('P7: RLS Anon Isolation', () => {
  it('anon client sees zero rows in profiles, subscriptions, generations, usage_stats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (_n) => {
          // Insert a generation row via service role (no auth.users FK needed for generations)
          const { data: gen } = await db.from('generations').insert({
            user_id: null,
            input_source: 'manual',
            input_content: 'anon isolation test',
            platforms: ['douyin'],
            platform_count: 1,
            result_json: {},
            status: 'success',
          }).select('id').single()

          // Query all four tables as anon
          const [{ data: p }, { data: s }, { data: g }, { data: u }] = await Promise.all([
            anon.from('profiles').select('id'),
            anon.from('subscriptions').select('id'),
            anon.from('generations').select('id'),
            anon.from('usage_stats').select('user_id'),
          ])

          // Cleanup
          if (gen?.id) await db.from('generations').delete().eq('id', gen.id)

          return (
            (p ?? []).length === 0 &&
            (s ?? []).length === 0 &&
            (g ?? []).length === 0 &&
            (u ?? []).length === 0
          )
        }
      ),
      { numRuns: 5 }
    )
  })
})
