import { defineConfig } from 'vitest/config'
import path from 'path'
import dotenv from 'dotenv'

// Load .env.local for Supabase keys
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') })

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../../src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: [
      'tests/integration/supabase-infrastructure/**/*.test.ts',
      'tests/integration/risk-control-launch-readiness/**/*.test.ts',
    ],
  },
})
