import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The API roles must be able to USE schema public, or every table and function grant in the
 * snapshot is unreachable and PostgREST refuses every request.
 *
 * Provisioning from the snapshot drops the project's stock public schema first (the dump opens
 * with CREATE SCHEMA public), and the drop takes that schema's grants with it. pg_dump cannot
 * re-emit them - on the dump source the schema's access is the stock default, which it does not
 * write out - so scripts/rebuild-snapshot.sh appends a schema usage epilogue. This fails CI if a
 * regeneration drops it; scripts/test-privilege-parity.sh checks the effect on a provisioned
 * database.
 */

const SNAPSHOT = 'supabase/rebuild/0000_full_rebuild.sql'
const GENERATOR = 'scripts/rebuild-snapshot.sh'

const GRANT = /^GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;\r?$/m

describe('rebuild snapshot - the API roles can use schema public', () => {
  it('grants USAGE on the schema to every API role', () => {
    expect(readFileSync(SNAPSHOT, 'utf8')).toMatch(GRANT)
  })

  it('is emitted by the generator, so a regeneration does not silently drop it', () => {
    expect(readFileSync(GENERATOR, 'utf8')).toMatch(GRANT)
  })

  it('grants it AFTER the schema is created', () => {
    const sql = readFileSync(SNAPSHOT, 'utf8')
    const created = sql.indexOf('CREATE SCHEMA public;')
    const granted = sql.search(GRANT)
    expect(created).toBeGreaterThan(-1)
    expect(granted).toBeGreaterThan(created)
  })
})
