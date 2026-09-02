import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * A schema-only pg_dump captures explicit column GRANTs but DROPS the migrations'
 * table-wide REVOKEs of Supabase's default privileges - they were no-ops in the
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

// The snapshot side REQUIRES `public.` qualification. pg_dump empties search_path
// (`set_config('search_path', '', false)`), so a bare-name REVOKE in the epilogue
// errors at runtime and silently leaves the default grant in place - a fix that
// reads correctly and does nothing. Only a schema-qualified REVOKE actually takes
// effect, so only those count here. (The chain side stays permissive: migrations
// run with public on the search_path, where bare names are fine.)
function tablesRevokedInSnapshot(): Set<string> {
  const sql = readFileSync(SNAPSHOT, 'utf8')
  const tables = new Set<string>()
  for (const m of sql.matchAll(/revoke\s+[a-z, ]+?\s+on\s+table\s+public\.\s*"?([a-z_][a-z0-9_]*)"?\s+from/gi)) {
    tables.add(m[1].toLowerCase())
  }
  return tables
}

describe('rebuild snapshot privilege epilogue', () => {
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

  // A table-level REVOKE cascades to that table's COLUMN privileges, so a REVOKE placed
  // AFTER the column GRANTs wipes them - the snapshot then provisions a DB with strictly
  // FEWER privileges than the chain (withdraw / self-service / session-read break). The
  // epilogue must therefore sit BEFORE the ACL section. Assert, per table, that its REVOKE
  // precedes every column GRANT on it. Applying the snapshot verifies this at runtime; this
  // is the cheap CI gate that fails without a database.
  it('orders each table REVOKE before every column GRANT on that table', () => {
    const sql = readFileSync(SNAPSHOT, 'utf8')
    const offenders: string[] = []
    for (const table of tablesRevokedInSnapshot()) {
      const revokeIdx = sql.search(new RegExp(`revoke\\s+[a-z, ]+?\\s+on\\s+table\\s+public\\.${table}\\s+from`, 'i'))
      const firstGrantIdx = sql.search(new RegExp(`grant\\s+.+?\\s+on\\s+table\\s+public\\.${table}\\s+to`, 'i'))
      if (revokeIdx !== -1 && firstGrantIdx !== -1 && firstGrantIdx < revokeIdx) offenders.push(table)
    }
    expect(
      offenders,
      `in ${SNAPSHOT} these tables have a column GRANT that appears BEFORE their table-level REVOKE: ` +
        `${offenders.join(', ')}. PostgreSQL cascades the REVOKE to those columns, so a snapshot-provisioned ` +
        `DB loses them. Emit the REVOKE epilogue BEFORE the ACL/GRANT section (see scripts/rebuild-snapshot.sh).`,
    ).toEqual([])
  })

  it('re-grants column privileges AFTER the table-level REVOKEs (Vuln 1: a REVOKE cascade-revokes columns)', () => {
    const lines = readFileSync(SNAPSHOT, 'utf8').split('\n')
    const lastMatch = (re: RegExp) => lines.reduce((acc, line, i) => (re.test(line) ? i : acc), -1)
    for (const t of tablesRevokedInChain()) {
      const grantAt = lastMatch(new RegExp(`grant\\s.*\\son\\s+table\\s+public\\.${t}\\s+to`, 'i'))
      const revokeAt = lastMatch(new RegExp(`revoke\\s.*\\son\\s+table\\s+(?:public\\.)?"?${t}"?\\s+from`, 'i'))
      // Every chain-revoked table also has column GRANTs; the last GRANT must come AFTER the
      // last table-level REVOKE, or the REVOKE cascade-destroys the column grants and a
      // snapshot-provisioned DB silently loses them (Vuln 1 - appending only the REVOKEs).
      expect(grantAt, `snapshot has no column GRANT for ${t}`).toBeGreaterThan(-1)
      expect(grantAt, `column GRANT for ${t} must be re-emitted AFTER its table-level REVOKE (Vuln 1)`).toBeGreaterThan(
        revokeAt,
      )
    }
  })
})
