import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The admin detail page needs to know WHETHER a setup code is outstanding and when it
 * expires. It must never be able to read the code itself.
 *
 * `setup_code_hash` is the stored secret, and ADR-0008 says plainly how weak it is: eight
 * characters over a 32-symbol alphabet, unsalted. Putting it in a page projection would make
 * an outstanding code brute-forceable by anyone who can see the rendered payload, and adding
 * one word to a column list is an easy, invisible way to do that.
 *
 * Only the SELECT lists are checked, not the whole file. `setup_code_hash` appears here
 * legitimately as a WRITE input - `InvitedProfileInput` carries it into
 * create_invited_profile - so a file-wide search would fail on arrival and the obvious "fix"
 * would be to delete the assertion.
 */
const source = readFileSync(join(process.cwd(), 'src/lib/data/profiles-directory.ts'), 'utf8')

/** Every `const PROFILE_*COLUMNS* = '...'` / `` = `...` `` body in that file. */
const projections = [...source.matchAll(/const PROFILE_[A-Z_]*COLUMNS[A-Z_]*\s*=\s*([`'])([\s\S]*?)\1/g)].map(
  (m) => m[2],
)

describe('the admin profile projections', () => {
  // Without this, a regex that stopped matching would make both assertions below pass
  // vacuously - the exact failure the repo's other source-scanning tests guard against.
  it('finds the column lists it means to check', () => {
    expect(projections.length).toBeGreaterThanOrEqual(2)
  })

  it('selects the setup code expiry, so the page can say whether an invite is live', () => {
    expect(projections.some((p) => p.includes('setup_code_expires_at'))).toBe(true)
  })

  it('never selects the setup code hash', () => {
    expect(projections.filter((p) => p.includes('setup_code_hash'))).toEqual([])
  })
})
