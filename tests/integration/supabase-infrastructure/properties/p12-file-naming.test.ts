// Feature: supabase-infrastructure, Property 12: Migration File Naming Convention
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readdirSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const FILE_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+\.sql$/

describe('P12: Migration File Naming Convention', () => {
  it('every file in supabase/migrations/ matches ^[0-9]{14}_[a-z0-9_]+\\.sql$', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f !== '.gitkeep')
    expect(files.length).toBeGreaterThan(0)

    // Use fast-check to assert the property over the actual file list
    fc.assert(
      fc.property(fc.constantFrom(...files), (file) => {
        return FILE_NAME_PATTERN.test(file)
      }),
      { numRuns: Math.min(files.length * 10, 100) }
    )
  })

  it('timestamp portion of each filename is a valid 14-digit UTC timestamp', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))

    fc.assert(
      fc.property(fc.constantFrom(...files), (file) => {
        const ts = file.slice(0, 14)
        const year   = parseInt(ts.slice(0, 4), 10)
        const month  = parseInt(ts.slice(4, 6), 10)
        const day    = parseInt(ts.slice(6, 8), 10)
        const hour   = parseInt(ts.slice(8, 10), 10)
        const minute = parseInt(ts.slice(10, 12), 10)
        const second = parseInt(ts.slice(12, 14), 10)

        return (
          year >= 2020 &&
          month >= 1 && month <= 12 &&
          day >= 1 && day <= 31 &&
          hour >= 0 && hour <= 23 &&
          minute >= 0 && minute <= 59 &&
          second >= 0 && second <= 59
        )
      }),
      { numRuns: 100 }
    )
  })
})
