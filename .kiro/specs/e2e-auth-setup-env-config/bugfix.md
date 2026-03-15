# Bugfix Requirements Document

## Introduction

The Playwright E2E auth setup test (`tests/e2e/auth.setup.ts`) silently skips the actual authentication flow when `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` environment variables are not set. Instead of failing loudly, it saves an empty storage state and exits with a passing status. This causes all downstream E2E tests that depend on authenticated state to run without a valid session — they either hit 401 responses or get redirected to the login page, producing misleading results (tests may pass vacuously or fail for the wrong reason).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `E2E_TEST_EMAIL` or `E2E_TEST_PASSWORD` is not set THEN the system logs a warning and saves an empty auth storage state, causing the test to pass without performing any authentication

1.2 WHEN the auth setup test passes with an empty storage state THEN the system allows dependent E2E tests to run without a valid authenticated session, producing unreliable test results

1.3 WHEN `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not set THEN the system silently skips session injection and saves an empty storage state instead of failing

### Expected Behavior (Correct)

2.1 WHEN `E2E_TEST_EMAIL` or `E2E_TEST_PASSWORD` is not set THEN the system SHALL fail the auth setup test with a clear error message indicating which environment variables are missing

2.2 WHEN the auth setup test fails due to missing credentials THEN the system SHALL prevent dependent E2E tests from running with an unauthenticated state

2.3 WHEN `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not set THEN the system SHALL fail the auth setup test with a clear error message indicating which Supabase environment variables are missing

### Unchanged Behavior (Regression Prevention)

3.1 WHEN all required environment variables are set and valid THEN the system SHALL CONTINUE TO authenticate the test user via Supabase password sign-in and save the session storage state

3.2 WHEN the Supabase sign-in API call succeeds THEN the system SHALL CONTINUE TO inject the access token and refresh token into localStorage and persist the storage state to `tests/e2e/.auth/user.json`

3.3 WHEN the Supabase sign-in API call fails with an error response THEN the system SHALL CONTINUE TO report the failure and not save a valid storage state
