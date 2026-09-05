import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * The snapshot's C-01 function epilogue sweeps EXECUTE away from every public function and
 * grants it back only to the names in a HAND-MAINTAINED `keeps_authenticated` list. The
 * migration chain grants EXECUTE per function directly. Those two must agree, or a
 * snapshot-provisioned database differs from a chain-provisioned one in function privileges.
 *
 * Nothing else catches that. scripts/test-privilege-parity.sh compares only TABLE and
 * COLUMN grants (see its dump_privs), so function drift passes it silently - which is how
 * `is_app_link` (added by 0099, granted to authenticated, and backing the CHECK constraint
 * on notifications.link) ended up missing from the list: a snapshot-provisioned database
 * would have refused every notification insert by an authenticated user.
 *
 * This resolves grants and revokes IN CHAIN ORDER, so the last statement touching a
 * function wins - the same way Postgres applies them.
 */

const MIGRATIONS_DIR = 'supabase/migrations'
const GENERATOR = 'scripts/rebuild-snapshot.sh'

/** Functions the migration chain leaves EXECUTE-able by `authenticated`, in chain order. */
function functionsGrantedToAuthenticated(): Set<string> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
  const granted = new Set<string>()
  // `grant|revoke execute on function <name>(<args>) to|from <roles>` - roles may be a list.
  const stmt = /(grant|revoke)\s+execute\s+on\s+function\s+([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*(to|from)\s+([^;]+);/gi
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    for (const m of sql.matchAll(stmt)) {
      const [, verb, name, , roles] = m
      if (!/\bauthenticated\b/i.test(roles)) continue
      if (verb.toLowerCase() === 'grant') granted.add(name.toLowerCase())
      else granted.delete(name.toLowerCase())
    }
  }
  return granted
}

/** The generator's hand-maintained keeps list. */
function keepsAuthenticated(): Set<string> {
  const sh = readFileSync(GENERATOR, 'utf8')
  const block = sh.slice(sh.indexOf('keeps_authenticated'), sh.indexOf('];', sh.indexOf('keeps_authenticated')))
  return new Set([...block.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1].toLowerCase()))
}

describe('snapshot function epilogue matches the migration chain', () => {
  it('finds both sides (guards against a vacuous pass)', () => {
    expect(functionsGrantedToAuthenticated().size).toBeGreaterThan(0)
    expect(keepsAuthenticated().size).toBeGreaterThan(0)
  })

  it('every function the chain grants to authenticated is kept by the epilogue', () => {
    const chain = functionsGrantedToAuthenticated()
    const keeps = keepsAuthenticated()
    const missing = [...chain].filter((fn) => !keeps.has(fn)).sort()
    expect(
      missing,
      `${GENERATOR}'s keeps_authenticated is missing:\n${missing.join('\n')}\n` +
        'A snapshot-provisioned database would deny authenticated callers these functions.',
    ).toEqual([])
  })

  // NOTE: the reverse direction (a stale keeps entry handing authenticated a function
  // the chain withholds) is NOT statically decidable here - most of the keeps list is
  // never granted by an explicit migration statement at all, it comes from Supabase's
  // default privileges. That direction is covered at RUNTIME by
  // scripts/test-privilege-parity.sh, which now diffs FUNCTION privileges between a
  // chain-provisioned and a snapshot-provisioned database.
})
