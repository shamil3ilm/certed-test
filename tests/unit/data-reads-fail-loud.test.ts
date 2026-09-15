import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A data-layer read never discards its error.
 *
 * `const { data } = await supabase.from(...)...` drops the `error` PostgREST returns, and the
 * `data ?? []` / `?? null` that follows turns an outage into a plausible answer: an empty list, a
 * profile that "does not exist", a class with no subject, zero failed uploads on the health check.
 * The callers then act on it - a duplicate check that sees no rows lets the duplicate through,
 * a guard that sees no row reports "not found" for something that exists.
 *
 * RLS is not a reason to swallow it: a row the caller may not read comes back as NO ROW with no
 * error, so a read that returns an error has failed, and throws.
 */

const DATA = 'src/lib/data'

/** A destructure of `data` or `count` from an awaited query that leaves `error` out. */
const DISCARDS_ERROR = /const \{ (data|count)(?:: \w+)? \} = await\b/

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return /\.ts$/.test(entry.name) ? [full] : []
  })
}

describe('data-layer reads fail loud', () => {
  it('the pattern matches the shape it forbids, and not the one it asks for', () => {
    expect(DISCARDS_ERROR.test("const { data } = await admin.from('x').select('*')")).toBe(true)
    expect(DISCARDS_ERROR.test("const { count } = await admin.from('x').select('id', { head: true })")).toBe(true)
    expect(DISCARDS_ERROR.test("const { data, error } = await admin.from('x').select('*')")).toBe(false)
    expect(files(DATA).length).toBeGreaterThan(20)
  })

  it('no read in src/lib/data drops its error', () => {
    const offenders = files(DATA).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${file.replace(/\\/g, '/')}:${i + 1}` }))
        .filter(({ line }) => DISCARDS_ERROR.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    )
    expect(offenders, 'Destructure `error` too, and throw `new Error(`<module>.<fn>: ${error.message}`)`').toEqual([])
  })
})
