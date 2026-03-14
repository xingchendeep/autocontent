import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { upsertProfile } from '@/lib/auth';
import { generateRequestId } from '@/lib/errors';

/**
 * GET /auth/callback?code=...
 * Exchanges the PKCE code for a session, upserts the user profile,
 * then redirects to /dashboard. On any error, redirects to /login?error=...
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_link', origin),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error(`[${requestId}] exchangeCodeForSession error:`, error?.message);
    return NextResponse.redirect(
      new URL('/login?error=auth_failed', origin),
    );
  }

  // Non-blocking — failure is logged but never prevents reaching /dashboard
  await upsertProfile(data.user.id, requestId);

  return NextResponse.redirect(new URL('/dashboard', origin));
}
