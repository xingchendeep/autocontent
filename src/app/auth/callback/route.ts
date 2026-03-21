import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * GET /auth/callback
 * 
 * Handles two Supabase auth callback flows:
 * 
 * 1. Token hash flow (recommended for email templates):
 *    /auth/callback?token_hash=xxx&type=magiclink
 *    Uses verifyOtp() — works across browsers/devices.
 * 
 * 2. PKCE code flow (default ConfirmationURL):
 *    /auth/callback?code=xxx
 *    Uses exchangeCodeForSession() — requires same browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? searchParams.get('callback') ?? '/';

  // Build redirect response to attach cookies to
  const successUrl = new URL(next, origin);
  const successResponse = NextResponse.redirect(successUrl);
  const errorResponse = () => NextResponse.redirect(new URL('/login?error=auth_failed', origin));

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            successResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Flow 1: Token hash (from custom email templates)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.error('[auth/callback] verifyOtp error:', error.message);
      return errorResponse();
    }
    return successResponse;
  }

  // Flow 2: PKCE code exchange (from default ConfirmationURL)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return errorResponse();
    }
    return successResponse;
  }

  console.error('[auth/callback] No token_hash or code parameter found');
  return errorResponse();
}
