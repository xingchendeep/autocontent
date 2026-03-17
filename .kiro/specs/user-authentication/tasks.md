# Implementation Plan: User Authentication

## Overview

Implement email-based sign-in (magic link / OTP), sign-out, server-side session management,
Edge Middleware route protection, and automatic profile creation using Supabase Auth and
`@supabase/ssr`. Tasks are ordered: infrastructure → lib → routes → UI → tests.

## Tasks

- [x] 1. Install dependencies and add auth types
  - Run `pnpm add @supabase/ssr @supabase/supabase-js` if not already installed
  - Add `AuthUser` and `AuthSession` interfaces to `src/types/index.ts`
  - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`
  - _Requirements: 3.5, 7.1_

- [x] 2. Implement Supabase client factories
  - [x] 2.1 Create `src/lib/auth/server.ts` — `createSupabaseServerClient()` using `cookies()` from `next/headers`
    - Read-only cookie adapter for Server Components and Route Handlers
    - Uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` (server-only)
    - _Requirements: 3.1, 3.5_

  - [x] 2.2 Create `src/lib/auth/middleware-client.ts` — `createSupabaseMiddlewareClient(request, response)`
    - Read + write cookie adapter that mutates both `request.cookies` and `response.cookies`
    - _Requirements: 4.5, 7.1_

  - [x] 2.3 Create `src/lib/auth/client.ts` — `createSupabaseBrowserClient()`
    - Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - Must not reference `localStorage` or `sessionStorage`
    - _Requirements: 7.4_

  - [ ]* 2.4 Write unit test — `createSupabaseBrowserClient` does not use localStorage
    - Assert no reference to `localStorage` / `sessionStorage` in the browser client module
    - _Requirements: 7.4_

- [x] 3. Implement auth helper functions in `src/lib/auth/index.ts`
  - [x] 3.1 Implement `getSession()` — reads session from HTTP-only cookie via server client, returns `{ id, email } | null`
    - Returns `null` for missing, expired, or revoked sessions
    - Never reads user ID from request body or query string
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property test for `getSession` — P4: returns null without valid cookie
    - **Property 4: getSession returns null for any request without a valid session**
    - **Validates: Requirements 3.4, 7.3**
    - File: `tests/unit/auth/properties/p4-getsession-null-without-cookie.test.ts`
    - Use `fc.record(...)` for request variants; min 100 runs

  - [x] 3.3 Implement `upsertProfile(userId, requestId)` — upserts `public.profiles` with `onConflict: 'id'`
    - Uses anon server client (not service role)
    - Catches all errors, logs with `requestId`, never throws
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 3.4 Write property test for `upsertProfile` — P8: upsert is idempotent
    - **Property 8: Profile upsert is idempotent**
    - **Validates: Requirements 5.1, 5.2, 5.5**
    - File: `tests/unit/auth/properties/p8-upsert-idempotent.test.ts`
    - Use `fc.uuid()` for user IDs, `fc.integer({min:1,max:5})` for call count; min 100 runs

  - [ ]* 3.5 Write property test for `upsertProfile` — P9: failure never blocks navigation
    - **Property 9: Profile upsert failure never blocks navigation**
    - **Validates: Requirements 5.4**
    - File: `tests/unit/auth/properties/p9-upsert-failure-nonblocking.test.ts`
    - Use `fc.string()` for error messages; min 100 runs

  - [x] 3.6 Implement `signOut()` — calls `supabase.auth.signOut()`, logs on error, always redirects to `/login`
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 3.7 Write property test for `signOut` — P3: always redirects to /login
    - **Property 3: Sign-out always redirects to /login**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - File: `tests/unit/auth/properties/p3-signout-always-redirects.test.ts`
    - Use `fc.boolean()` for signOut success/failure; min 100 runs

- [x] 4. Implement Edge Middleware (`middleware.ts`)
  - Create root `middleware.ts` using `createSupabaseMiddlewareClient`
  - Call `supabase.auth.getUser()` to trigger token refresh and write updated cookies
  - Redirect unauthenticated requests to `/dashboard/*` → `/login`
  - Redirect authenticated requests to `/login` → `/dashboard`
  - Export `config` with matcher `['/dashboard/:path*', '/login']`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.1 Write property test — P5: unauthenticated /dashboard/* always redirects
    - **Property 5: Unauthenticated requests to /dashboard/* are always redirected**
    - **Validates: Requirements 4.1, 4.2**
    - File: `tests/unit/auth/properties/p5-unauthenticated-dashboard-redirect.test.ts`
    - Use `fc.string()` for path suffixes; min 100 runs

  - [ ]* 4.2 Write property test — P6: authenticated /dashboard/* always proceeds
    - **Property 6: Authenticated requests to /dashboard/* always proceed**
    - **Validates: Requirements 4.3**
    - File: `tests/unit/auth/properties/p6-authenticated-dashboard-proceeds.test.ts`
    - Use `fc.string()` for path suffixes; min 100 runs

  - [ ]* 4.3 Write property test — P7: authenticated user visiting /login redirects to /dashboard
    - **Property 7: Authenticated users visiting /login are redirected to /dashboard**
    - **Validates: Requirements 4.4**
    - File: `tests/unit/auth/properties/p7-authenticated-login-redirect.test.ts`
    - Use `fc.record(...)` for session variants; min 100 runs

- [x] 5. Implement auth callback route (`src/app/auth/callback/route.ts`)
  - Handle `GET /auth/callback?code=...`
  - Call `supabase.auth.exchangeCodeForSession(code)`
  - On success: call `upsertProfile(user.id, requestId)`, redirect to `/dashboard`
  - On missing/invalid code or exchange error: redirect to `/login?error=...`
  - _Requirements: 1.4, 1.5, 5.1, 5.4_

  - [ ]* 5.1 Write unit test — callback redirects to /dashboard on success
    - _Requirements: 1.5_

  - [ ]* 5.2 Write unit test — callback redirects to /login?error=... on failure
    - _Requirements: 1.6_

  - [ ]* 5.3 Write property test — P10: session cookie attributes are always correct
    - **Property 10: Session cookie attributes are always correct (HttpOnly, Secure, SameSite=Lax)**
    - **Validates: Requirements 7.1**
    - File: `tests/unit/auth/properties/p10-cookie-attributes.test.ts`
    - Use `fc.record(...)` for session data; min 100 runs

- [x] 6. Implement sign-out route (`src/app/api/signout/route.ts`)
  - Handle `POST /api/signout`
  - Call `signOut()` from `src/lib/auth/index.ts`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement `LoginForm` client component (`src/components/auth/LoginForm.tsx`)
  - `'use client'` directive
  - Controlled email input with `<label>` element
  - Zod `z.string().email()` validation — show inline error without calling Supabase on invalid input
  - Call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '/auth/callback' } })`
  - Manage four UI states: `idle` | `loading` | `sent` | `error`
  - Disable submit button during `loading`
  - Show confirmation message on `sent`
  - Show user-readable error message on `error`
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 6.3, 6.4_

  - [ ]* 8.1 Write property test — P1: invalid emails are always rejected
    - **Property 1: Invalid emails are always rejected (never calls signInWithOtp)**
    - **Validates: Requirements 1.3**
    - File: `tests/unit/auth/properties/p1-invalid-email-rejected.test.ts`
    - Use `fc.string()` filtered to non-emails; min 100 runs

  - [ ]* 8.2 Write property test — P2: valid emails always trigger sign-in
    - **Property 2: Valid emails always trigger signInWithOtp exactly once**
    - **Validates: Requirements 1.2**
    - File: `tests/unit/auth/properties/p2-valid-email-triggers-signin.test.ts`
    - Use `fc.emailAddress()`; min 100 runs

  - [ ]* 8.3 Write unit tests for `LoginForm`
    - Renders email input, label, and submit button (Req 1.1, 6.3)
    - Shows confirmation state after successful OTP dispatch (Req 6.4)
    - Disables submit button during loading (Req 1.7)
    - _Requirements: 1.1, 1.7, 6.3, 6.4_

- [x] 9. Implement login page (`src/app/(auth)/login/page.tsx`)
  - Server Component shell at `/login`
  - Display product name "AutoContent Pro" and sign-in method description
  - Render `<LoginForm />` client component
  - Include `<noscript>` fallback message indicating JavaScript is required
  - _Requirements: 6.1, 6.2, 6.5, 6.6_

  - [ ]* 9.1 Write unit tests for login page
    - Renders product name and sign-in description (Req 6.2)
    - `noscript` fallback message present in HTML (Req 6.6)
    - _Requirements: 6.2, 6.6_

- [x] 10. Implement dashboard layout (`src/app/dashboard/layout.tsx`)
  - Read session server-side using `getSession()`
  - Render sign-out control (button or form POSTing to `/api/signout`) visible to authenticated users
  - _Requirements: 2.1, 3.1_

  - [ ]* 10.1 Write unit test — dashboard layout renders sign-out control for authenticated users
    - _Requirements: 2.1_

- [x] 11. Write integration test for profile upsert idempotence
  - Test `upsertProfile` against a real Supabase instance following the pattern in `tests/integration/supabase-infrastructure/`
  - Verify RLS policy enforcement end-to-end: calling upsert N times yields exactly 1 row
  - _Requirements: 5.1, 5.2, 5.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests live in `tests/unit/auth/properties/` and are tagged with `// Feature: user-authentication, Property N: <text>`
- Each property test runs a minimum of 100 iterations via fast-check
- `upsertProfile` uses the anon client — never the service role key
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` are server-only; `NEXT_PUBLIC_` variants are used in the browser client
