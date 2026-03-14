import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
// Local Supabase DB is always on port 54322
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Service-role client — bypasses RLS, used for test setup/teardown */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Anon client — no auth token, used to verify RLS blocks unauthenticated access */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** User-scoped client — simulates an authenticated user by injecting a JWT. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/**
 * Execute a raw SQL query directly against the Postgres DB.
 * Use this for system catalog queries (pg_tables, information_schema, etc.)
 * that are not accessible via PostgREST.
 */
export async function querySql<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    await client.end()
  }
}
