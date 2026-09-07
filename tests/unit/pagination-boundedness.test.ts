import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * In-memory pagination is only real pagination when the list it slices is BOUNDED.
 *
 * `pageSlice(rows, page, size)` renders a fixed number of rows and drives a pager, so a
 * page built on it LOOKS paged whatever the underlying read does. When that read is an
 * unbounded `.select()`, it is not: PostgREST caps every response at the project's Max rows
 * (default 1000, see src/lib/data/paginate.ts), so the fetch silently truncates, the total
 * the pager prints understates, and rows past the cap cannot be reached from the UI at all.
 * Nothing fails, nothing logs - the list just quietly stops being complete.
 *
 * That is exactly how /session-timings shipped: an oversight reader pulled every session
 * AND every attendance mark in the academy on each page view, and the truncation also made
 * real attendance look like it belonged to no session.
 *
 * So every call site is enumerated here with the reason its source is bounded. A NEW one
 * fails this test until someone writes that reason down - and if they cannot, the answer is
 * to page in SQL instead (toRange + `.range()` + `count: 'exact'`), which is what the
 * documents, users, admin-finance, history and session-timings lists all do.
 */

const ROOTS = ['src/app', 'src/lib']

/** Call sites allowed to slice in memory, each with WHY its source cannot grow unbounded.
 *  Keep the reason specific: "it's fine" is not a bound.
 *
 *  CURRENTLY EMPTY, and that is the goal state rather than an oversight - every portal list
 *  now pages in SQL. `pageSlice` is kept because it is still the right tool for a genuinely
 *  fixed set, but reaching for it again has to be argued for here. */
const BOUNDED_BY_DESIGN: Record<string, string> = {}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Does this line CALL pageSlice? Not an import of it, and not its own definition.
 *  Exported as its own function so the scan-sanity test below exercises THIS matcher rather
 *  than a copy of it - a duplicated regex would keep passing while the real one rotted. */
function isPageSliceCall(line: string): boolean {
  if (/^\s*import\b/.test(line)) return false
  return /\bpageSlice\s*\(/.test(line)
}

/** Files that CALL pageSlice - not the ones that merely import or define it. */
function pageSliceCallSites(): string[] {
  const found = new Set<string>()
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative('.', file).replace(/\\/g, '/')
      if (rel === 'src/lib/pagination.ts') continue
      if (readFileSync(file, 'utf8').split('\n').some(isPageSliceCall)) found.add(rel)
    }
  }
  return [...found].sort()
}

describe('in-memory pagination is only used over bounded reads', () => {
  const sites = pageSliceCallSites()

  it('the scan works, so an empty result means "no call sites" and not "broken scanner"', () => {
    // With the allowlist empty, "found nothing" is the PASSING state - so the scan itself is
    // what needs proving. A typo in the walker or the regex would otherwise silently turn
    // this whole file into a test that can never fail.
    expect(walk('src/app').length, 'the walker found no source files under src/app').toBeGreaterThan(20)
    // These exercise the REAL matcher the scan uses, not a copy of its regex - a duplicate
    // would keep passing here while the one that does the work rotted.
    expect(isPageSliceCall('  const rows = pageSlice(items, page, 20)'), 'a real call is not matched').toBe(true)
    expect(isPageSliceCall("import { pageSlice } from '@/lib/pagination'"), 'an import is matched').toBe(false)
    expect(isPageSliceCall('  const n = totalPages(x, 20)'), 'an unrelated call is matched').toBe(false)
    // And the rule still has a subject: pageSlice must exist to be governed.
    expect(readFileSync('src/lib/pagination.ts', 'utf8')).toMatch(/export function pageSlice\b/)
  })

  it('every pageSlice call site has a written reason its source is bounded', () => {
    const undeclared = sites.filter((f) => !(f in BOUNDED_BY_DESIGN))
    expect(
      undeclared,
      `these call pageSlice over a read with no recorded bound: ${undeclared.join(', ')}. ` +
        'Either page in SQL (toRange + .range() + count: exact), or add the file to ' +
        'BOUNDED_BY_DESIGN in this test with the reason its source cannot grow unbounded.',
    ).toEqual([])
  })

  it('every recorded reason still corresponds to a real call site', () => {
    // A stale entry is worse than none: it reads as a considered decision about code that
    // has since moved on, and would silently bless the next file to take that path.
    const stale = Object.keys(BOUNDED_BY_DESIGN).filter((f) => !sites.includes(f))
    expect(stale, `BOUNDED_BY_DESIGN names files that no longer call pageSlice: ${stale.join(', ')}`).toEqual([])
  })

  it('no reason is left as a placeholder', () => {
    const weak = Object.entries(BOUNDED_BY_DESIGN)
      .filter(([, why]) => why.trim().length < 40)
      .map(([f]) => f)
    expect(weak, `these reasons are too short to be a real bound: ${weak.join(', ')}`).toEqual([])
  })
})
