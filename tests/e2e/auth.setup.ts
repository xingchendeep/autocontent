import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

// Playwright workers are separate processes; load .env.local explicitly
config({ path: path.resolve(process.cwd(), '.env.local') })

/**
 * Auth setup: signs in a test user via magic link OTP and saves storage state.
 *
 * Requires env vars:
 *   E2E_TEST_EMAIL    — test account email
 *   E2E_TEST_PASSWORD — not used (OTP flow), kept for future password auth
 *
 * NOTE: In a real CI environment you would use the Supabase Admin API to
 * generate a session token directly, bypassing the email flow.
 * Here we use the signInWithPassword fallback if the test account has a
 * password set, otherwise the test is skipped gracefully.
 */

const AUTH_FILE = 'tests/e2e/.auth/user.json'

setup('authenticate test user', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  if (!email || !password) {
    console.warn('[auth.setup] E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — skipping auth setup')
    // Save empty state so dependent tests can still run (they will hit 401 / redirect)
    await page.context().storageState({ path: AUTH_FILE })
    return
  }

  await page.goto('/login')

  // Fill email
  await page.fill('input[type="email"]', email)

  // For E2E we rely on Supabase's signInWithPassword via a direct API call
  // because magic-link email delivery is not available in test environments.
  // We inject a session cookie by calling the Supabase REST API directly.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[auth.setup] Supabase env vars not set — skipping session injection')
    await page.context().storageState({ path: AUTH_FILE })
    return
  }

  // Sign in via Supabase REST to get access_token
  const res = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    data: { email, password },
  })

  if (!res.ok()) {
    console.warn('[auth.setup] Supabase sign-in failed:', await res.text())
    await page.context().storageState({ path: AUTH_FILE })
    return
  }

  const { access_token, refresh_token } = await res.json() as {
    access_token: string
    refresh_token: string
  }

  // Inject tokens into localStorage so the Supabase SSR client picks them up
  await page.goto('/')
  await page.evaluate(
    ({ url, accessToken, refreshToken }) => {
      const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
      localStorage.setItem(key, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
      }))
    },
    { url: supabaseUrl, accessToken: access_token, refreshToken: refresh_token },
  )

  await page.context().storageState({ path: AUTH_FILE })
})
