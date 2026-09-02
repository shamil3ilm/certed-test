import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Every table that enables row-level security in the migration chain must be exercised
 * by scripts/test-rls.sh - named in at least one seed row or assertion. This does NOT
 * prove the assertions are GOOD, only that a policy can't ship with ZERO coverage,
 * which was NEW-32's failure mode (the `guardians` PII policy shipped unasserted).
 *
 * Mirrors mock-schema-parity.test.ts: it turns "keep the RLS harness in step with the
 * policies" from a habit into a gate that runs in the existing `verify` job - the same
 * mechanical remedy that fixed formatting, snapshot drift and mock parity.
 */

const MIGRATIONS_DIR = 'supabase/migrations'
const HARNESS = 'scripts/test-rls.sh'

// Tables whose RLS policies predate this gate and are not yet asserted. This is TRACKED
// DEBT, not an allowance: shrink it by adding assertions to test-rls.sh, then delete the
// entry here (the second test below forces that). NEVER add a new table to this list
// without a written reason - a new RLS-enabled table should be asserted, not exempted.
const RLS_EXEMPT = new Set<string>([
  'audit_log',
  'comments',
  'consents',
  'document_counters',
  'entity_tags',
  'exchange_rates',
  'meet_links',
  'pending_emails',
  'rate_limit_counters',
  'resource_versions',
  'tags',
  'timetable_slots',
])

function rlsEnabledTables(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
  const tables = new Set<string>()
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi,
    )) {
      tables.add(m[1].toLowerCase())
    }
    // Follow renames so a table's CURRENT name is what we check - a table renamed
    // after enabling RLS keeps RLS under its new name (e.g. 0019 class_teachers ->
    // class_tutors). A dropped table leaves the set.
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+rename\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      const [from, to] = [m[1].toLowerCase(), m[2].toLowerCase()]
      if (tables.delete(from)) tables.add(to)
    }
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      tables.delete(m[1].toLowerCase())
    }
  }
  return [...tables].sort()
}

// A table is "covered" if its name appears as a whole word anywhere in the harness (a
// seed insert or an assertion). Underscore is a word char, so `\btags\b` correctly does
// NOT match `entity_tags`.
function isNamedInHarness(table: string, harness: string): boolean {
  return new RegExp(`\\b${table}\\b`).test(harness)
}

describe('RLS harness coverage', () => {
  it('every RLS-enabled table is exercised by scripts/test-rls.sh (or explicitly exempted)', () => {
    const harness = readFileSync(HARNESS, 'utf8')
    const uncovered = rlsEnabledTables().filter((t) => !RLS_EXEMPT.has(t) && !isNamedInHarness(t, harness))
    expect(
      uncovered,
      `these tables enable RLS in a migration but are never named in ${HARNESS}: ${uncovered.join(', ')}. ` +
        `Add at least one assertion for each (see the guardians / subjects examples), or exempt it with a written reason.`,
    ).toEqual([])
  })

  it('the exempt list holds only genuinely-uncovered RLS tables (keeps the debt honest)', () => {
    const harness = readFileSync(HARNESS, 'utf8')
    const rls = new Set(rlsEnabledTables())
    // An exempt entry that is now asserted, or is no longer an RLS table, must be removed
    // so the debt list can only shrink.
    const stale = [...RLS_EXEMPT].filter((t) => !rls.has(t) || isNamedInHarness(t, harness))
    expect(
      stale,
      `remove these from RLS_EXEMPT - they are now covered by, or no longer present in, the harness/schema: ${stale.join(', ')}.`,
    ).toEqual([])
  })
})
