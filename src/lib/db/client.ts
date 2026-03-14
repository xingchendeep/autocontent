import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client using SUPABASE_SERVICE_ROLE_KEY, bypassing RLS.
 * Server-side only — never expose to client code.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
