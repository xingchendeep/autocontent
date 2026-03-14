import { signOut } from '@/lib/auth';

/**
 * POST /api/signout
 * Delegates to signOut() which calls supabase.auth.signOut()
 * and always redirects to /login regardless of outcome.
 */
export async function POST(): Promise<never> {
  return signOut();
}
