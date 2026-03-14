import { redirect } from 'next/navigation';
import { generateRequestId } from '@/lib/errors';
import { createSupabaseServerClient } from './server';

/**
 * Reads the current session from the HTTP-only cookie managed by @supabase/ssr.
 * Returns { id, email } for a valid session, or null for missing/expired/revoked sessions.
 * Never reads user identity from request body or query string.
 */
export async function getSession(): Promise<{ id: string; email: string } | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !user.email) return null;
    return { id: user.id, email: user.email };
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
