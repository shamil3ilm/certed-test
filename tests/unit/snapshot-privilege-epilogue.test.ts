import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * A schema-only pg_dump captures explicit column GRANTs but DROPS the migrations'
 * table-wide REVOKEs of Supabase's default privileges (R-01) - they were no-ops in the
 * dump source (a migrated-only DB that never held the defaults), so they leave no ACL.
 * On a real Supabase project the `authenticated` role DOES hold those defaults, so a
 * snapshot without the REVOKEs silently regains the table-wide INSERT/UPDATE the chain
 * removed (submissions, profiles, ...). The rebuild snapshot re-applies them in a
 * "Table privilege epilogue"; this gate fails CI if a regen forgets it.
 */

const MIGRATIONS_DIR = 'supabase/migrations'
const SNAPSHOT = 'supabase/rebuild/0000_full_rebuild.sql'

// Tables the migration chain revokes a table-level privilege on. Requires the explicit
// `ON TABLE` keyword (as the chain's 6 revokes and the snapshot epilogue both use), which
// excludes `revoke ... on [all] functions/sequences ... from`.
function tablesRevokedInChain(): string[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f))
  const tables = new Set<string>()
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    for (const m of sql.matchAll(/revoke\s+[a-z, ]+?\s+on\s+table\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+from/gi)) {
      tables.add(m[1].toLowerCase())
    }
  }
  return [...tables].sort()
}

function tablesRevokedInSnapshot(): Set<string> {
  const sql = readFileSync(SNAPSHOT, 'utf8')
  const tables = new Set<string>()
  for (const m of sql.matchAll(/revoke\s+[a-z, ]+?\s+on\s+table\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+from/gi)) {
    tables.add(m[1].toLowerCase())
  }
  return tables
}

describe('rebuild snapshot privilege epilogue (R-01)', () => {
  it('re-applies a table-level REVOKE for every table the chain revokes', () => {
    const inSnapshot = tablesRevokedInSnapshot()
    const missing = tablesRevokedInChain().filter((t) => !inSnapshot.has(t))
    expect(
      missing,
      `these tables have a table-level REVOKE in the migration chain but NOT in the rebuild snapshot's ` +
        `privilege epilogue: ${missing.join(', ')}. A schema-only pg_dump drops them - re-append them to the ` +
        `epilogue in ${SNAPSHOT} (a snapshot-provisioned DB would otherwise regain the revoked grant).`,
    ).toEqual([])
  })
})
