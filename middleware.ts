import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/auth/middleware-client';

/**
 * Edge Middleware — runs before every matched request.
 * Calls getUser() to trigger token refresh and write updated cookies.
 * Protects /dashboard/* and redirects authenticated users away from /login, /register, /forgot-password.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Fallback: redirect /?code=... to /auth/callback?code=...
  // Handles Supabase Magic Link emails that point to the root URL instead of /auth/callback
  if (pathname === '/' && searchParams.has('code')) {
    const callbackUrl = new URL('/auth/callback', request.url);
    callbackUrl.search = request.nextUrl.search;
    return NextResponse.redirect(callbackUrl);
  }

  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);

  // getUser() validates the JWT server-side and refreshes the token if needed.
  // Any error (malformed cookie, network issue) is treated as "no session".
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));


  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if ((pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/admin/:path*', '/login', '/register', '/forgot-password'],
};
