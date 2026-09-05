import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Every harness that APPLIES the migration chain must enumerate ALL of it.
 *
 * These three scripts used `supabase/migrations/00*.sql`, which silently stopped matching
 * at 0100 - it covered 99 of 100 migrations while still exiting 0 and printing a pass. A
 * broken 0100 (a unique index on a column no finance table has) reached the tree unnoticed
 * because of it, and every future migration would have gone untested the same way.
 * A gate that quietly narrows is worse than one that fails, so assert the coverage.
 *
 * The scripts that merely COUNT migrations (check-snapshot-freshness, rebuild-snapshot)
 * already use `*.sql`; the risk is only in the ones that execute the SQL.
 */

const MIGRATIONS_DIR = 'supabase/migrations'
const APPLIERS = ['scripts/test-rls.sh', 'scripts/test-privilege-parity.sh', 'scripts/restore-drill.sh']

// Characters that need no escaping in a regex; anything else is wrapped in a character
// class (`.` -> `[.]`), which is literal there. Avoids backslash escaping entirely.
const SAFE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-/'

/** Turn a shell glob into an equivalent regex - only the constructs these scripts use. */
function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '[') {
      const close = glob.indexOf(']', i)
      out += glob.slice(i, close + 1) // a character class passes straight through
      i = close
    } else if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else {
      out += SAFE.includes(c) ? c : `[${c}]`
    }
  }
  return new RegExp(`^${out}$`)
}

function migrationGlobIn(script: string): string {
  const sh = readFileSync(script, 'utf8')
  const found = sh.match(/(supabase\/migrations\/[^\s;"']+\.sql)/)
  if (!found) throw new Error(`${script}: no migration glob found`)
  return found[1]
}

const allMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f))

describe('migration harnesses cover the whole chain', () => {
  it('there are migrations to cover (guards against a vacuous pass)', () => {
    expect(allMigrations.length).toBeGreaterThan(0)
  })

  it('the glob translator itself rejects the pattern that caused this', () => {
    // 00* matched 0001..0099 but not 0100 - the exact silent narrowing this gate exists for.
    const narrow = globToRegExp('supabase/migrations/00*.sql')
    expect(narrow.test('supabase/migrations/0099_x.sql')).toBe(true)
    expect(narrow.test('supabase/migrations/0100_x.sql')).toBe(false)
  })

  it.each(APPLIERS)('%s enumerates every migration', (script) => {
    const glob = migrationGlobIn(script)
    const re = globToRegExp(glob)
    const missed = allMigrations.filter((f) => !re.test(`${MIGRATIONS_DIR}/${f}`))
    expect(missed, `${script} uses "${glob}", which would skip:\n${missed.join('\n')}`).toEqual([])
  })
})
