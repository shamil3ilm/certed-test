import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * `supabase db dump --schema public` is SCHEMA-only, so it drops the one row migration
 * 0001 inserts into org_settings. That row is not optional: it carries the institute
 * name, timezone, currency, bank/signatory details and document prefixes that receipts,
 * pay slips, report cards, the calendar feed and the portal footer all read - and
 * selectOrgSettings() fetches it with `.single()`, which ERRORS (PGRST116) on zero rows.
 * A snapshot-provisioned database without it 500s all of those until someone inserts the
 * row by hand. scripts/rebuild-snapshot.sh appends a singleton data epilogue; this gate
 * fails CI if a regeneration drops it.
 */

const SNAPSHOT = 'supabase/rebuild/0000_full_rebuild.sql'
const GENERATOR = 'scripts/rebuild-snapshot.sh'

// public.-qualified, as the epilogue must be: pg_dump empties search_path, so a bare
// `org_settings` here would error at runtime and leave the table empty anyway.
const SEED =
  /INSERT\s+INTO\s+public\.org_settings\s*\(\s*id\s*\)\s+VALUES\s*\(\s*true\s*\)\s+ON\s+CONFLICT\s+DO\s+NOTHING/i

describe('rebuild snapshot - org_settings singleton seed', () => {
  it('seeds the singleton row, so a snapshot-provisioned database can read org_settings', () => {
    expect(readFileSync(SNAPSHOT, 'utf8')).toMatch(SEED)
  })

  it('is emitted by the generator, so a regeneration does not silently drop it', () => {
    expect(readFileSync(GENERATOR, 'utf8')).toMatch(SEED)
  })

  it('places the seed AFTER the table is created', () => {
    const sql = readFileSync(SNAPSHOT, 'utf8')
    const created = sql.indexOf('CREATE TABLE public.org_settings')
    const seeded = sql.search(SEED)
    expect(created).toBeGreaterThan(-1)
    expect(seeded).toBeGreaterThan(created)
  })
})
