import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { buildSeed } from '@/lib/mock/seed'

/**
 * A migration that creates a table the app reads must ship with a mock counterpart in
 * the same change. Without one, the mock store auto-creates an empty array and the app
 * can fail at runtime on a query the fixture would have satisfied - a cryptic failure
 * that surfaces far from its cause (e.g. the whole E2E suite falling over during login).
 * migration-checklist.md item 4 asks "Does mock mode need matching support?"; this turns
 * that checklist line into a gate.
 *
 * The rule: every public table created in supabase/migrations/ must be an explicit key
 * in buildSeed() (an empty array is fine for a write-only table). The mock store
 * auto-creates an empty array for an unknown table, so a missing fixture fails
 * SILENTLY at runtime - requiring an explicit seed key forces a conscious decision.
 */

const MIGRATIONS_DIR = 'supabase/migrations'

// Tables intentionally without a mock counterpart. Add here ONLY with a justification
// that the app never reads the table in mock mode (empty for now - prefer seeding).
const MOCK_EXEMPT = new Set<string>([])

function tablesCreatedInChain(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
  const live = new Set<string>()
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    for (const m of sql.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      live.add(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(/drop table\s+(?:if exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      live.delete(m[1].toLowerCase())
    }
    // Follow renames so a table's current name is what we check (e.g. 0019
    // class_teachers -> class_tutors).
    for (const m of sql.matchAll(
      /alter table\s+(?:if exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+rename to\s+"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      const [from, to] = [m[1].toLowerCase(), m[2].toLowerCase()]
      if (live.delete(from)) live.add(to)
    }
  }
  return [...live].sort()
}

describe('mock schema parity', () => {
  it('every table created in the migration chain has an explicit mock-seed counterpart', () => {
    const seedKeys = new Set(Object.keys(buildSeed()))
    const missing = tablesCreatedInChain().filter((t) => !seedKeys.has(t) && !MOCK_EXEMPT.has(t))
    expect(
      missing,
      `migrations create these tables with no key in src/lib/mock/seed.ts buildSeed(): ${missing.join(', ')}. ` +
        `Add each as a seed array (empty is fine if the app never reads it in mock mode), or exempt it with a reason.`,
    ).toEqual([])
  })
})
