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

      // Where a revoked table DOES grant columns back, the last GRANT must come AFTER the
      // last table-level REVOKE, or the REVOKE cascade-destroys the column grants and a
      // snapshot-provisioned DB silently loses them (Vuln 1 - appending only the REVOKEs).
      //
      // A table with NO column grants is not a failure: it is the stricter state. attendance
      // is revoked outright because every write goes through the service-role client, so
      // there is nothing to hand back. Requiring a grant here would push us to invent one.
      if (grantAt === -1) continue

      expect(grantAt, `column GRANT for ${t} must be re-emitted AFTER its table-level REVOKE (Vuln 1)`).toBeGreaterThan(
        revokeAt,
      )
    }
  })
})

/**

 * C-01 gate: the SAME defect as the table epilogue, one object class over - and it went

 * unseen because this file and its sibling CI check only ever looked at tables.

 *

 * pg_dump writes function ACLs against POSTGRES defaults, so it emits `REVOKE ALL ON

 * FUNCTION x FROM PUBLIC`. Supabase ALSO grants EXECUTE to anon/authenticated as NAMED

 * roles, and a revoke from PUBLIC does not remove a named-role grant - so a

 * snapshot-provisioned database hands every SECURITY DEFINER function to the publishable

 * key. issue_receipt_doc / issue_payslip_doc do not self-authorize, so that is document

 * forgery, not just information disclosure.

 */

describe('rebuild snapshot function privilege epilogue (C-01)', () => {
  const snapshot = readFileSync(SNAPSHOT, 'utf8')

  it('carries a function epilogue that revokes EXECUTE from anon and authenticated', () => {
    expect(
      /revoke\s+execute\s+on\s+function\s+%s\s+from\s+public,\s*anon,\s*authenticated/i.test(snapshot),

      'the snapshot has no function-privilege sweep: every SECURITY DEFINER function ' +
        'stays EXECUTE-able by anon on a Supabase-provisioned database',
    ).toBe(true)
  })

  it('closes the default so a newly created function is not granted to anon/authenticated', () => {
    expect(
      /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+public,\s*anon,\s*authenticated/i.test(
        snapshot,
      ),

      'without this a function added later arrives with anon/authenticated EXECUTE again - the exact C-01 mechanism',
    ).toBe(true)
  })

  it('runs the sweep AFTER the function GRANTs, so it has the last word', () => {
    // Unlike a TABLE revoke - which cascades to that table's column grants and so must

    // come first - this sweep revokes AND re-grants per function, so it sets the final

    // state wherever it runs. Placing it last means nothing pg_dump emits afterwards can

    // reopen it.

    const sweep = snapshot.search(/revoke execute on function %s from public, anon, authenticated/i)

    const lastFunctionGrant = snapshot.lastIndexOf('GRANT ALL ON FUNCTION')

    expect(sweep, 'function sweep missing').toBeGreaterThan(-1)

    expect(lastFunctionGrant, 'no function ACL section found').toBeGreaterThan(-1)

    expect(sweep, 'the sweep must come after the ACL GRANTs it corrects').toBeGreaterThan(lastFunctionGrant)
  })
})

/**

 * The chain side of the same rule.

 *

 * Policing every historical `revoke ... from public` is not useful - the chain is applied

 * history and a dozen early migrations predate the lesson. What must hold is the END

 * STATE: the chain finishes with a fail-closed sweep that strips anon/authenticated from

 * every function it does not explicitly allow, and closes the default so the NEXT

 * function created cannot arrive open. That is what makes a re-signed function (the C-01

 * mechanism, where a new 13-arg signature was a brand-new object) safe by construction.

 */

describe('migration chain: function EXECUTE is closed by default', () => {
  const chain = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))

    .sort()

    .map((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8'))

    .join('\n')

  it('sweeps every function, revoking from anon and authenticated', () => {
    expect(
      /revoke execute on function %s from public, anon, authenticated/i.test(chain),

      'no fail-closed function sweep in the chain: a function added or re-signed later ' +
        'keeps the anon/authenticated grants Supabase gives it at creation',
    ).toBe(true)
  })

  it('closes the default privilege for functions created afterwards', () => {
    expect(
      /alter default privileges in schema public revoke execute on functions from public, anon, authenticated/i.test(
        chain,
      ),

      '0034 closed this only for PUBLIC, which is why every function created after it - ' +
        'including 0095 re-signing issue_receipt_doc - still arrived granted to anon',
    ).toBe(true)
  })

  /**

   * Forward-looking half of the rule, and the one that actually stops a repeat.

   *

   * The end-state checks above pass the moment 0096 exists, so on their own they would

   * NOT have caught 0095 - the migration that caused C-01 - because 0095's own

   * `revoke ... from public` sails through while the sweep is still present elsewhere in

   * the chain. Applied history cannot be rewritten (16 early migrations predate the

   * lesson), so it is grandfathered at the sweep: every migration numbered ABOVE it must

   * name anon and authenticated when it locks a function down.

   */

  it('no migration added after the sweep revokes a function from PUBLIC only', () => {
    const SWEEP = 96 // 0096 introduced the fail-closed sweep; everything after it is held to the rule

    const offenders: string[] = []

    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f))) {
      if (Number(file.slice(0, 4)) <= SWEEP) continue

      const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')

      for (const m of sql.matchAll(
        /revoke\s+(?:all|execute)[^;]*?\bon\s+function\s+([^;]*?)\s+from\s+([a-z_, ]+);/gi,
      )) {
        const roles = m[2].toLowerCase()

        if (!roles.includes('anon') || !roles.includes('authenticated')) {
          offenders.push(`${file}: revoke ... from ${roles.trim()} -> ${m[1].split('(')[0].trim()}`)
        }
      }
    }

    expect(
      offenders,

      'a revoke naming only PUBLIC reads like a lockdown and is not one - Supabase grants ' +
        'EXECUTE to anon/authenticated as NAMED roles, which FROM PUBLIC does not remove:\n' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('C-01 regression: the document-minting functions are revoked from anon by signature', () => {
    for (const fn of ['issue_receipt_doc', 'issue_payslip_doc']) {
      const revoked = new RegExp(
        `revoke execute on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated`,

        'i',
      ).test(chain.replace(/\s+/g, ' '))

      expect(
        revoked,

        `${fn} is SECURITY DEFINER and does not self-authorize - if anon holds EXECUTE, ` +
          'anyone with the publishable key can mint financial documents',
      ).toBe(true)
    }
  })
})
