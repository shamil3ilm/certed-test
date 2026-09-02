import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { RLS_REQUIRED_TABLES } from '@/lib/services/queue-health'

/**
 * V-07 anti-drift guard: bind queue-health's RLS_REQUIRED_TABLES (the tables whose
 * disabled-RLS misconfiguration must ALARM) to the live schema, so a new RLS-enabled table
 * cannot be silently forgotten by the monitor. Mirrors rls-coverage-parity.test.ts:
 *   - every monitored table must actually enable RLS in the chain (no stale/renamed entry),
 *   - every RLS-enabled table must be EITHER monitored OR explicitly exempted with a reason.
 * Adding a table without a decision fails the build - the drift V-07 was about.
 */

const MIGRATIONS_DIR = 'supabase/migrations'

/**
 * RLS-enabled tables that deliberately do NOT need the disabled-RLS alarm: catalog / config
 * / counter tables and class-scoped content that hold no PII-of-record. This is a shrink-only
 * decision list, NOT a dumping ground - a genuinely sensitive new table belongs in
 * RLS_REQUIRED_TABLES, not here. Each entry states why it's safe to leave unmonitored.
 */
const RLS_MONITOR_EXEMPT = new Set<string>([
  'calendar_events', // class-scoped scheduling entries; no PII of record
  'classes', // class metadata (name/subject); not personal data
  'comments', // class-scoped submission comments; not a PII-of-record store
  'document_counters', // per-series sequence numbers; no personal data
  'entity_tags', // tag<->entity join rows; no personal data
  'exchange_rates', // FX reference data; not personal
  'meet_links', // class-scoped meeting URLs; no PII of record
  'pending_emails', // outbound queue, SERVICE-ROLE only (no authenticated read grant)
  'rate_limit_counters', // ephemeral rate-limit state; no personal data
  'reminders', // owner/assignee-scoped reminder text; not a PII-of-record store
  'resource_versions', // class-scoped document version history; parent resources is monitored
  'subjects', // subject catalog; not personal data
  'tags', // tag catalog; not personal data
  'timetable_slots', // recurring class schedule; no PII of record
])

/** Tables that enable RLS somewhere in the migration chain, following renames and drops so
 *  the CURRENT name is what we check (same parser as rls-coverage-parity.test.ts). */
function rlsEnabledTables(): Set<string> {
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
  return tables
}

describe('queue-health RLS_REQUIRED_TABLES parity with the schema (V-07)', () => {
  const rls = rlsEnabledTables()

  it('every monitored table actually enables RLS in the migration chain', () => {
    const stale = RLS_REQUIRED_TABLES.filter((t) => !rls.has(t))
    expect(
      stale,
      `these are in RLS_REQUIRED_TABLES but no migration enables RLS on them (renamed/dropped/typo?): ${stale.join(', ')}`,
    ).toEqual([])
  })

  it('every RLS-enabled table is either monitored or explicitly exempted (no silent drift)', () => {
    const monitored = new Set(RLS_REQUIRED_TABLES)
    const unclassified = [...rls].filter((t) => !monitored.has(t) && !RLS_MONITOR_EXEMPT.has(t)).sort()
    expect(
      unclassified,
      `these tables enable RLS but are neither in RLS_REQUIRED_TABLES nor RLS_MONITOR_EXEMPT: ${unclassified.join(', ')}. ` +
        `Add each to the monitor (if it holds sensitive data) or to RLS_MONITOR_EXEMPT with a written reason.`,
    ).toEqual([])
  })

  it('the exempt list holds only real, currently-unmonitored RLS tables (keeps it honest)', () => {
    const monitored = new Set(RLS_REQUIRED_TABLES)
    const stale = [...RLS_MONITOR_EXEMPT].filter((t) => !rls.has(t) || monitored.has(t)).sort()
    expect(
      stale,
      `remove these from RLS_MONITOR_EXEMPT - they are now monitored, or no longer enable RLS: ${stale.join(', ')}`,
    ).toEqual([])
  })
})
