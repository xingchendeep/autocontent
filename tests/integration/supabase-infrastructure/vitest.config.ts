import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      globals: true,
      environment: 'node',
      testTimeout: 30000,
      env: {
        SUPABASE_URL: env.SUPABASE_URL || 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || '',
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || '',
        DATABASE_URL: env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      },
    },
  }
})
