// Feature: supabase-infrastructure, Property 13: All DDL Uses IF NOT EXISTS Guards
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Extract all CREATE TABLE / CREATE INDEX / CREATE UNIQUE INDEX statements
 * from a SQL string. Returns each statement as a trimmed string.
 */
function extractCreateStatements(sql: string): string[] {
  // Match from CREATE (TABLE|INDEX|UNIQUE INDEX) up to the next semicolon
  const matches = sql.match(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\b[^;]+;/gi)
  return matches ?? []
}

describe('P13: All DDL Uses IF NOT EXISTS Guards', () => {
  it('every CREATE TABLE statement contains IF NOT EXISTS', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))

    fc.assert(
      fc.property(fc.constantFrom(...files), (file) => {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
        const stmts = extractCreateStatements(sql)

        return stmts.every(stmt => {
          const isTable = /CREATE\s+TABLE\b/i.test(stmt)
          const isIndex = /CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(stmt)
          if (!isTable && !isIndex) return true
          return /IF\s+NOT\s+EXISTS/i.test(stmt)
        })
      }),
      { numRuns: 100 }
    )
  })

  it('no CREATE TABLE without IF NOT EXISTS in any migration file', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      const bad = sql.match(/CREATE TABLE (?!IF NOT EXISTS)/gi) ?? []
      expect(bad, `${file}: found CREATE TABLE without IF NOT EXISTS`).toHaveLength(0)
    }
  })

  it('no CREATE INDEX without IF NOT EXISTS in any migration file', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      const bad = sql.match(/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/gi) ?? []
      expect(bad, `${file}: found CREATE INDEX without IF NOT EXISTS`).toHaveLength(0)
    }
  })
})
