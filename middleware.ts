import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/auth/middleware-client';

/**
 * Edge Middleware — runs before every matched request.
 * Calls getUser() to trigger token refresh and write updated cookies.
 * Protects /dashboard/* and redirects authenticated users away from /login.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);

  // getUser() validates the JWT server-side and refreshes the token if needed.
  // Any error (malformed cookie, network issue) is treated as "no session".
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
