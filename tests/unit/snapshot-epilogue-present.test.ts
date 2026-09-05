import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The R-01 table privilege epilogue must actually BE in the shipped snapshot.
 *
 * Nothing else checks this. snapshot-privilege-epilogue.test.ts compares the generator's
 * hand-maintained list against the migrations - both sides can be perfect while the
 * splice that puts the list INTO the snapshot produces nothing. And privilege parity
 * cannot see it either: measured, scripts/test-privilege-parity.sh reports OK against a
 * snapshot with the epilogue and against the identical snapshot without it.
 *
 * That blind spot is not theoretical - a regenerated snapshot was committed carrying
 * zero table REVOKEs (awk's `getline < file` returns -1 on error, so an unreadable
 * epilogue file left it empty and the dump was copied through unspliced, silently).
 * This asserts the artifact itself.
 */

const SNAPSHOT = 'supabase/rebuild/0000_full_rebuild.sql'
const GENERATOR = 'scripts/rebuild-snapshot.sh'

/** The REVOKE lines the generator intends to splice, read from its own epilogue block. */
function intendedRevokes(): string[] {
  const sh = readFileSync(GENERATOR, 'utf8')
  const block = sh.slice(sh.indexOf('cat >"$EPI" <<\'EPILOGUE\''), sh.indexOf('\nEPILOGUE'))
  return block
    .split('\n')
    .map((l) => l.replace(/\r$/, '').trim())
    .filter((l) => l.startsWith('REVOKE'))
}

describe('rebuild snapshot - R-01 table privilege epilogue reaches the artifact', () => {
  it('the generator declares at least one table REVOKE to splice', () => {
    expect(intendedRevokes().length).toBeGreaterThan(0)
  })

  it('every declared REVOKE is present verbatim in the snapshot', () => {
    const snapshot = readFileSync(SNAPSHOT, 'utf8')
    const missing = intendedRevokes().filter((line) => !snapshot.includes(line))
    expect(missing, `missing from ${SNAPSHOT}:\n${missing.join('\n')}`).toEqual([])
  })

  it('splices them BEFORE the first ACL entry, so the column GRANTs are not cascaded away', () => {
    // A table-level REVOKE cascades to that table's COLUMN privileges. Landing after the
    // column GRANTs pg_dump emits would wipe them - the epilogue would read correctly and
    // break withdraw / self-service / session reads.
    const snapshot = readFileSync(SNAPSHOT, 'utf8')
    const firstRevoke = snapshot.search(/^REVOKE .* ON TABLE public\./m)
    const firstAcl = snapshot.indexOf('; Type: ACL;')
    expect(firstRevoke).toBeGreaterThan(-1)
    expect(firstAcl).toBeGreaterThan(-1)
    expect(firstRevoke).toBeLessThan(firstAcl)
  })
})
