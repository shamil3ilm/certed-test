import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A `.limit()` read is a DELIBERATE cap. The hazard is not the cap - it is rendering the
 * capped result as though it were the whole set.
 *
 * This is the gap the other two gates cannot see. pagination-boundedness asks whether a UI
 * list slices in memory; unbounded-reads asks whether a query bounds itself. Both would pass
 * a read that is correctly capped at 200 and then shown under a heading that reads as the
 * complete record, with filters that make it look authoritative. That is exactly what the
 * class Attendance Details view did - a silent newest-200, no pager, no total, so filtering
 * to "absent" across a year searched only the recent slice - and the same shape hid four
 * years of a student's pastoral notes.
 *
 * So every capped read has to declare which it is:
 *
 *   PAGED       the cap IS a page (it sits beside .range or an exact count) - not this gate.
 *   PREVIEW     a deliberate "recent N", where the UI says so and offers a way to the rest.
 *   LOOKUP      limit(1)-style existence or newest-one reads.
 *   COMPLETE    the cap is above a bound the data cannot exceed, and that bound is named.
 *
 * Write the reason down or page it. "It's enough" is not a bound.
 */

const ROOTS = ['src/lib/data', 'src/lib/services']

/**
 * Calling a PAGED api for page 1 only is a cap wearing a pager's clothes.
 *
 * This gate's `.limit()` scan cannot see it - the read underneath uses .range() and an exact
 * count, so it looks properly paged - and that is exactly how the classwork materials view
 * came to fetch `{ page: 1, pageSize: 500 }` and then report `items.length` as the total,
 * so a class with more materials than the cap claimed it had exactly the cap.
 *
 * Keyed by "file:constant-or-literal used as pageSize".
 */
const SINGLE_PAGE_BY_DESIGN: Record<string, string> = {
  'src/lib/services/page-data/class-stream.ts:ARCHIVED_PAGE_SIZE':
    'PREVIEW - archived announcements are a collapsed secondary panel, not the Stream. The ' +
    'live Stream beside it is fully paged.',
  'src/lib/services/page-data/classwork.ts:ARCHIVED_PAGE_SIZE':
    'PREVIEW - the archived-materials panel, same shape as the class Stream one.',
  'src/lib/services/page-data/classwork.ts:CLASS_DOCS_CAP':
    'PREVIEW, and STATED - materials group by category so they cannot be paged without ' +
    'splitting a group across pages. It reports the QUERY total and shows a banner naming ' +
    'how many of how many are visible, with the filters that narrow it directly above.',
}

/** Capped reads and WHY the cap cannot mislead. Keyed by "file:functionName". */
const CAPPED_BY_DESIGN: Record<string, string> = {
  'src/lib/data/attendance.ts:selectRecentForClass':
    'PREVIEW - the recent marks a class summary shows, capped by RECENT_CLASS_MARKS_CAP. ' +
    'The complete record is the paged Attendance Details view on the same page.',
  'src/lib/data/calendar-events.ts:selectEvents':
    'COMPLETE within the window the caller always passes - the calendar reads a month or a ' +
    'week, never "all events". The optional limit is a guard on top of that date range, ' +
    'not the thing bounding the result.',
  'src/lib/data/finance-docs-reads.ts:selectRecentDocs':
    'PREVIEW - the ledger preview on the admin finance page, directly above the paged, ' + 'searchable ledger itself.',
  'src/lib/data/meet-links.ts:selectNewestForClasses':
    'PREVIEW - "the newest active links from each source" per its own docstring: current ' + 'links, not a history.',
  'src/lib/data/messages-rows.ts:selectMessageWindow':
    'PAGED - a cursor window. It asks for limit + 1 precisely to detect whether older ' +
    'messages exist, which is how the thread knows to offer "load older".',
  'src/lib/data/messages-rows.ts:searchMessages':
    'PREVIEW - in-thread search results, capped by the caller. Narrowing further is the ' +
    'user own next move, and the thread itself remains cursor-paged.',
  'src/lib/data/notifications.ts:selectUnreadNotificationIds':
    'COMPLETE to the only bound that matters - the header badge caps its own display, so a ' +
    'count past the cap renders identically. The feed itself is paged.',
  'src/lib/data/profiles-directory.ts:selectActiveProfilesByRoles':
    'PREVIEW - a typeahead/candidate picker, capped by the caller and narrowed by its own ' +
    'search. The authoritative roster is the paged, searchable /admin/users list.',
  'src/lib/data/reminders.ts:selectSentForUser':
    'PREVIEW - the recently-sent reminders shown beneath the outstanding ones, capped by ' +
    'the caller. The outstanding set (selectPendingForUser) is the operative list.',
  'src/lib/data/resources.ts:selectRecentForClasses':
    'PREVIEW - the dashboard "recent uploads" widget. The full library is the paged, ' + 'filterable documents view.',
  'src/lib/data/timetable-slots.ts:selectSlots':
    'COMPLETE - a weekly timetable is bounded by the week: slots per class per day, not a ' +
    'history. The limit is an optional caller guard on top of that, not the bound.',
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

/** A cap that is part of a PAGE - `.range()` or an exact count in the same query - is not
 *  what this gate is about, so those functions are skipped. */
const PART_OF_A_PAGE = /\.range\(|count:\s*'exact'/
/** `.limit(1)` and `.limit(1)`-shaped reads answer "is there one", not "here is the list". */
const SINGLE_ROW = /\.limit\(1\)|\.maybeSingle\(\)|\.single\(\)/

function cappedReads(): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative('.', file).replace(/\\/g, '/')
      const text = readFileSync(file, 'utf8')
      const starts = [...text.matchAll(/export (?:async )?function (\w+)/g)].map((m) => ({
        name: m[1],
        at: m.index ?? 0,
      }))
      for (let i = 0; i < starts.length; i++) {
        // Comments stripped first. A block splits on the NEXT `export function`, so the
        // docstring introducing that next function sits inside this one - and a docstring
        // that merely MENTIONS `.limit()` was enough to flag a properly paged read.
        const body = text
          .slice(starts[i].at, starts[i + 1]?.at ?? text.length)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*/g, '')
        if (!/\.limit\(/.test(body)) continue
        if (PART_OF_A_PAGE.test(body) || SINGLE_ROW.test(body)) continue
        found.push(`${rel}:${starts[i].name}`)
      }
    }
  }
  return found.sort()
}

/** Sites that ask a paged reader for page 1 and nothing else. */
function singlePageCallSites(): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = relative('.', file).replace(/\\/g, '/')
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // `page: 1` followed by a pageSize, within a short window - the shape of a paged call
      // pinned to its first page.
      for (const m of text.matchAll(/page:\s*1\s*,[\s\S]{0,120}?pageSize:\s*([A-Za-z_$][\w$]*|\d+)/g)) {
        found.push(`${rel}:${m[1]}`)
      }
    }
  }
  return [...new Set(found)].sort()
}

describe('a capped read must not be presented as the complete set', () => {
  const capped = cappedReads()

  it('the scan finds capped reads at all (an empty result would pass vacuously)', () => {
    expect(capped.length).toBeGreaterThan(0)
  })

  it('every capped read declares why its cap cannot mislead', () => {
    const undeclared = capped.filter((k) => !(k in CAPPED_BY_DESIGN))
    expect(
      undeclared,
      `these cap their result with no recorded reason: ${undeclared.join(', ')}. ` +
        'Either page it (toRange + .range() + count: exact) or add it to CAPPED_BY_DESIGN ' +
        'saying whether it is a PREVIEW, a LOOKUP or COMPLETE - and, for a preview, that the ' +
        'UI offers a way to the rest.',
    ).toEqual([])
  })

  it('no declaration outlives the read it describes', () => {
    const stale = Object.keys(CAPPED_BY_DESIGN).filter((k) => !capped.includes(k))
    expect(stale, `CAPPED_BY_DESIGN names reads that no longer cap: ${stale.join(', ')}`).toEqual([])
  })

  it('every paged reader pinned to page 1 declares why one page is enough', () => {
    const sites = singlePageCallSites()
    expect(sites.length, 'the single-page scan found nothing - has the shape changed?').toBeGreaterThan(0)
    const undeclared = sites.filter((k) => !(k in SINGLE_PAGE_BY_DESIGN))
    expect(
      undeclared,
      `these call a paged reader for page 1 only, which is a cap the .limit() scan cannot ` +
        `see: ${undeclared.join(', ')}. Give the surface a real pager, or declare it here.`,
    ).toEqual([])
  })

  it('no single-page declaration outlives its call site', () => {
    const sites = singlePageCallSites()
    const stale = Object.keys(SINGLE_PAGE_BY_DESIGN).filter((k) => !sites.includes(k))
    expect(stale, `SINGLE_PAGE_BY_DESIGN names sites that no longer pin page 1: ${stale.join(', ')}`).toEqual([])
  })

  it('every reason names its kind, so "it is fine" cannot pass as one', () => {
    const vague = Object.entries(CAPPED_BY_DESIGN)
      .filter(([, why]) => !/^(PREVIEW|PAGED|LOOKUP|COMPLETE)/.test(why.trim()))
      .map(([k]) => k)
    expect(vague, `these reasons do not start with PREVIEW / PAGED / LOOKUP / COMPLETE: ${vague.join(', ')}`).toEqual(
      [],
    )
  })
})
