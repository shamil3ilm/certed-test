import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A page number off the end must fold back, not render blank.
 *
 * `parsePageParam` can only clamp the LOWER bound - it has no idea how many rows exist - so
 * a hand-edited `?page=999`, a bookmark from when a list was longer, or simply narrowing a
 * filter while on page 4 sails through and the reader gets an empty list with no rows, no
 * explanation, and no way back except editing the URL. `clampPage` exists for exactly this
 * and says so in its own docstring; the rule is only useful if every paged surface applies it.
 *
 * So: a module that parses a page param must also clamp one. Both live in
 * src/lib/pagination.ts, so this is a pairing check, not a style preference.
 */

const ROOTS = ['src/lib/services/page-data', 'src/app']

/** Surfaces that read a page param but deliberately do not clamp, with the reason. */
const UNCLAMPED_BY_DESIGN: Record<string, string> = {}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function parsesAPage(text: string): boolean {
  return /\bparsePageParam\s*\(/.test(text)
}
function clampsAPage(text: string): boolean {
  return /\bclampPage\s*\(/.test(text)
}

function unclampedSurfaces(): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8')
      if (parsesAPage(text) && !clampsAPage(text)) found.push(relative('.', file).replace(/\\/g, '/'))
    }
  }
  return found.sort()
}

describe('every paged surface folds an out-of-range page back', () => {
  it('the scan works, so an empty result means "all clamped" and not "broken scanner"', () => {
    // With no violations, passing is the empty state - so prove the matchers still match.
    expect(parsesAPage('const p = parsePageParam(searchParams.page)')).toBe(true)
    expect(clampsAPage('const p = clampPage(requested, total, SIZE)')).toBe(true)
    expect(clampsAPage('const p = Math.min(requested, pages)')).toBe(false)
    expect(walk('src/lib/services/page-data').length).toBeGreaterThan(10)
  })

  it('no surface parses a page param without clamping one', () => {
    const unclamped = unclampedSurfaces().filter((f) => !(f in UNCLAMPED_BY_DESIGN))
    expect(
      unclamped,
      `these read a page number but never fold it back, so a stale ?page= renders blank: ` +
        `${unclamped.join(', ')}. Use clampPage(requested, total, pageSize) and re-read at the ` +
        `clamped page, or record the reason here.`,
    ).toEqual([])
  })

  it('no exemption outlives its surface', () => {
    const all = unclampedSurfaces()
    const stale = Object.keys(UNCLAMPED_BY_DESIGN).filter((f) => !all.includes(f))
    expect(stale, `UNCLAMPED_BY_DESIGN names surfaces that now clamp: ${stale.join(', ')}`).toEqual([])
  })
})
