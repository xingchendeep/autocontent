import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local for E2E test credentials
config({ path: path.resolve(process.cwd(), '.env.local') })

/**
 * Playwright E2E test configuration.
 * Tests run against a live Next.js instance (local or staging).
 *
 * Set PLAYWRIGHT_BASE_URL to point at staging for CI runs.
 *
 * Local browser: uses manually downloaded chrome-win64 to avoid network issues.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to override the browser path.
 */

const LOCAL_CHROME = path.join(
  process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local',
  'ms-playwright',
  'chromium-1208',
  'chrome-win64',
  'chrome.exe',
)

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? LOCAL_CHROME

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Setup project: creates authenticated storage state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        launchOptions: { executablePath },
      },
    },
    // Main E2E tests — depend on setup for auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath },
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
})
