import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A read that walks offsets needs a TOTAL order, or it silently duplicates and skips rows.
 *
 * Postgres guarantees no ordering without ORDER BY, and each page of a `.range()` walk is a
 * SEPARATE statement - so with a low-cardinality sort key (a date, a created_at second) the
 * rows that tie can come back in a different arrangement per request. A row then appears on
 * two pages, and another on none.
 *
 * This is measured, not assumed. Against real Postgres, 100 rows across 4 dates (25 tying on
 * each), walked in 5 pages of 20:
 *
 *   ORDER BY session_date DESC, id   -> 100 rows, 100 distinct   every row exactly once
 *   ORDER BY session_date DESC       -> 100 rows,  94 distinct   6 duplicated, 6 never shown
 *
 * Six percent wrong, silently. It corrupts a paged LIST (a row missing from every page) and
 * an AGGREGATE alike - fetchAllPaged walks offsets too, so a truncated-and-doubled set feeds
 * an attendance percentage or an FX re-price the same way.
 *
 * The rule: a query with `.range()` must order by something unique - the primary key, or a
 * column the query's own filters make unique.
 */

const ROOT = 'src/lib/data'

/** Columns that are unique enough to make an order total, given the query's filters. */
const TOTAL_ORDER_KEYS = ['id', 'profile_id', 'entity_id', 'conversation_id', 'student_id']

/** Reads that walk offsets with no total order, each with why that is safe. */
const UNORDERED_BY_DESIGN: Record<string, string> = {
  'src/lib/data/finance-fx.ts:selectUnconvertedCurrencies':
    'Reads ONE column to build a distinct set of currency codes. The result is a Set, so the ' +
    'order rows arrive in cannot change it - a duplicate collapses and a reordering is invisible.',
  'src/lib/data/billing-rates.ts:selectPartiesWithDocForPeriod':
    'Builds a Set of party ids to answer "who already has a document this period". Same ' +
    'argument: a Set cannot be changed by the order its rows arrived in.',
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) out.push(full)
  }
  return out
}

function offsetWalkersWithoutTotalOrder(): string[] {
  const found: string[] = []
  for (const file of walk(ROOT)) {
    const rel = relative('.', file).replace(/\\/g, '/')
    const text = readFileSync(file, 'utf8')
    const starts = [...text.matchAll(/export (?:async )?function (\w+)/g)].map((m) => ({
      name: m[1],
      at: m.index ?? 0,
    }))
    for (let i = 0; i < starts.length; i++) {
      const body = text
        .slice(starts[i].at, starts[i + 1]?.at ?? text.length)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
      if (!/\.range\(/.test(body)) continue
      const hasTotalOrder = TOTAL_ORDER_KEYS.some((k) => new RegExp(`\\.order\\('${k}'`).test(body))
      if (!hasTotalOrder) found.push(`${rel}:${starts[i].name}`)
    }
  }
  return found.sort()
}

describe('every offset-walking read has a total order', () => {
  it('the scan works, so an empty result is a real pass', () => {
    // With no violations, passing is the empty state - prove the matchers still match.
    expect(walk(ROOT).length).toBeGreaterThan(15)
    expect(/\.range\(/.test('  .range(from, to)')).toBe(true)
    expect(
      TOTAL_ORDER_KEYS.some((k) => new RegExp(`\\.order\\('${k}'`).test(".order('id', { ascending: true })")),
    ).toBe(true)
    expect(
      TOTAL_ORDER_KEYS.some((k) => new RegExp(`\\.order\\('${k}'`).test(".order('created_at', { ascending: false })")),
    ).toBe(false)
  })

  it('no read pages by offset without a key that makes the order total', () => {
    const offenders = offsetWalkersWithoutTotalOrder().filter((k) => !(k in UNORDERED_BY_DESIGN))
    expect(
      offenders,
      `these walk offsets with no unique sort key, so rows can repeat across pages and ` +
        `others never appear: ${offenders.join(', ')}. Add .order('<primary key>') as the ` +
        `LAST key, or record here why the result is order-independent.`,
    ).toEqual([])
  })

  it('no exemption outlives its read', () => {
    const all = offsetWalkersWithoutTotalOrder()
    const stale = Object.keys(UNORDERED_BY_DESIGN).filter((k) => !all.includes(k))
    expect(stale, `UNORDERED_BY_DESIGN names reads that now order totally: ${stale.join(', ')}`).toEqual([])
  })
})
