import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { generateRequestId } from '@/lib/errors';
import { createSupabaseServerClient } from './server';

/**
 * Reads the current session from the HTTP-only cookie managed by @supabase/ssr.
 * Falls back to Authorization: Bearer <token> header for programmatic API access.
 * Returns { id, email } for a valid session, or null for missing/expired/revoked sessions.
 */
export async function getSession(): Promise<{ id: string; email: string } | null> {
  try {
    // 1. Try cookie-based session first (standard browser flow)
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user?.email) {
      return { id: user.id, email: user.email };
    }

    // 2. Fallback: check Authorization: Bearer header (API / integration tests)
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: { user: bearerUser }, error: bearerError } = await client.auth.getUser(token);
      if (!bearerError && bearerUser?.email) {
        return { id: bearerUser.id, email: bearerUser.email };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Upserts a row in public.profiles for the given userId.
 * Uses the anon server client (never service role).
 * Catches all errors and logs with requestId — never throws.
 */
export async function upsertProfile(userId: string, requestId: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, default_language: 'zh-CN' }, { onConflict: 'id' });
    if (error) {
      console.error(`[${requestId}] upsertProfile error:`, error.message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${requestId}] upsertProfile unexpected error:`, msg);
  }
}

/**
 * Signs the current user out and always redirects to /login.
 * Logs any signOut error but does not let it block the redirect.
 */
export async function signOut(): Promise<never> {
  const requestId = generateRequestId();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(`[${requestId}] signOut error:`, error.message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${requestId}] signOut unexpected error:`, msg);
  }
  redirect('/login');
}
