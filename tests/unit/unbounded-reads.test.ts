import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * A READ over a table that grows forever must say how it is bounded.
 *
 * PostgREST caps every response at the project's Max rows (default 1000) and reports no
 * error when it truncates. On a table bounded by a roster or a catalogue that never
 * matters. On one that grows with time - every attendance mark, every session, every
 * receipt ever issued - it eventually does, and the failure is silent: a report card's
 * attendance percentage computed from an arbitrary 1000 rows, a mentor dashboard missing a
 * cohort's older marks, an FX recompute leaving the back catalogue priced at the old rate
 * while reporting plausible converted/unconverted counts. A short list is obvious; a wrong
 * number is not.
 *
 * `tests/unit/pagination-boundedness.test.ts` guards the sibling hazard - a UI list that
 * LOOKS paged because it slices in memory. It inspects `pageSlice` call sites only, so a
 * service-role batch read is invisible to it. This guards the read itself.
 *
 * A function passes by BOUNDING its read - `.range()`, `.limit()`, `fetchAllPaged`,
 * `.single()`, `.maybeSingle()`, `count: 'exact'` - or by appearing below with the reason
 * its result set cannot grow. "It's small" is not a reason; name the thing that bounds it.
 */

/** Tables whose row count only ever goes up. Reads over anything else are out of scope. */
const EVER_GROWING = [
  'attendance',
  'class_sessions',
  'receipts',
  'payslips',
  'audit_log',
  'notifications',
  'submissions',
  'pending_emails',
  'rate_limit_counters',
  'reminders',
  'resource_versions',
  // Added after a sweep found the original list covered 11 of the schema's 39 tables, and
  // that the gap was not arbitrary: these all accumulate with TIME rather than with the
  // roster, which is exactly the shape this gate exists to catch.
  'comments',
  'messages',
  'conversations',
  'assignments',
  'announcements',
  'calendar_events',
  'mentee_notes',
  'attachments',
  'entity_tags',
]

/** Constructs that bound a read, whatever the table. */
const BOUNDED = /\.range\(|\.limit\(|fetchAllPaged|\.single\(|\.maybeSingle\(|count:\s*'exact'/

/** A statement that WRITES. `.select()` after one of these is a RETURNING clause naming the
 *  columns to hand back - it returns what the write touched, so the row cap cannot make it
 *  wrong. Flagging these would fill the report with noise and get the guard switched off. */
const WRITE = /\.(insert|update|upsert|delete)\(|\.rpc\(/

/** Reads allowed to be unbounded, each with WHY the set cannot grow without limit.
 *  Keyed by "file:functionName". */
const BOUNDED_BY_DESIGN: Record<string, string> = {
  'src/lib/data/attendance.ts:selectForClassDate':
    'One class on ONE date - at most one mark per enrolled student. Bounded by the roster.',
  'src/lib/data/attendance.ts:selectMarkedClassIds':
    'Which of a NAMED set of classes have marks on ONE date. Bounded by the class list the ' + 'caller already holds.',
  'src/lib/data/attendance.ts:selectJoinRowsForSessionsAsService':
    'Bounded by construction: at most one PAGE of session ids goes in, each carrying one ' +
    'mark per enrolled student. It replaced a by-class read that did truncate.',
  'src/lib/data/class-sessions.ts:selectSessionsForDate':
    'One class on ONE date. A class holds a handful of sessions a day, not a history.',
  'src/lib/data/class-sessions.ts:selectSessionsForDateAsService':
    'The same single-date bound, read service-side for an oversight caller.',
  'src/lib/data/class-sessions.ts:selectTutorOverlappingSessions':
    'Sessions overlapping ONE window for one tutor - the double-booking check. A tutor ' +
    'cannot hold more concurrent sessions than the window has hours, and the 0101 exclusion ' +
    'constraint enforces that independently.',
  'src/lib/data/reminders.ts:selectPendingForUser':
    'is_sent = false - the OUTSTANDING reminders of one user. The set drains as reminders ' +
    'fire, so it tracks work in hand rather than accumulating.',
  'src/lib/data/reminders.ts:selectAssignedByCreator':
    'Reminders one person created FOR OTHERS. NOTE: the weakest bound in this list - there ' +
    'is no is_sent filter, so it does accumulate over a tenure. Convert this one first; it ' +
    'needs a UI paging decision (or a sent/unsent split) rather than just a query change, ' +
    'which is why it is listed here rather than quietly paged.',
  'src/lib/data/resource-versions.ts:selectVersionsForResource':
    'Version history of ONE document. Bounded by how often that document is re-uploaded.',
  'src/lib/data/submissions-reads.ts:selectActiveByAssignment':
    'One assignment, at most one active submission per enrolled student. Bounded by roster.',
  'src/lib/data/submissions-reads.ts:selectSupersededByAssignment':
    'One assignment - roster x resubmissions of that single assignment.',
  'src/lib/data/submissions-reads.ts:selectUngradedByAssignments':
    'The ungraded submissions of a NAMED assignment set, one per student each.',
  'src/lib/data/submissions-reads.ts:selectActiveByStudent':
    'The active submissions of ONE student: one per assignment ever set for them, so ' +
    'bounded by the assignments of the classes they are enrolled in.',
  'src/lib/data/submissions-reads.ts:selectSupersededByStudent':
    'The same per-student bound, plus that student own resubmissions.',
  'src/lib/data/submissions-service-reads.ts:selectEvaluatedSubmissionsForStudentAsService':
    'The graded submissions of ONE student - one per assignment they were set.',
  'src/lib/data/resource-versions.ts:selectVersionsForResources':
    'Version history for a NAMED set of documents. Bounded by how often those documents ' +
    'are re-uploaded, not by academy-wide time.',
  'src/lib/data/submissions-reads.ts:selectActiveByAssignments':
    'Active submissions for a NAMED assignment set - at most one per enrolled student each.',
  'src/lib/data/submissions-service-reads.ts:selectActiveSubmissionsForStudentAsService':
    'The active submissions of ONE student - one per assignment they were set.',
  'src/lib/data/submissions-writes.ts:selectActiveSubmissionIdForStudent':
    'The active submission of ONE student for ONE assignment - a uniqueness lookup.',
  // --- added when the watch list widened to the time-growing tables it had missed ---
  'src/lib/data/assignments.ts:selectAssignments':
    'Always called with a class scope, an activeOnly flag or a due-date window (the calendar ' +
    'and dashboards); its own docstring says the window is what bounds it. The CLASSWORK ' +
    'list, the one caller that read a class whole history, now uses selectAssignmentPage.',
  'src/lib/data/assignments.ts:selectActiveAssignmentsByClassIdsAsService':
    'ACTIVE assignments for a named class set - work in hand, which drains as assignments ' +
    'close, rather than a history that accumulates.',
  'src/lib/data/assignments.ts:selectAssignmentsByIdsAsService':
    'Bounded by the ids passed in, which come from a page of submissions.',
  'src/lib/data/class-sessions.ts:selectSessionsByIds':
    'Bounded by construction: at most one PAGE of attendance-record rows supplies the ids. ' +
    'It exists to replace a flat newest-N read that gave the record pager and its session ' +
    'context different horizons.',
  'src/lib/data/comments.ts:selectForEntities':
    'Comments on a NAMED entity set - every caller passes a page of documents, or one ' +
    'student own submissions. Bounded by the page above it, not by time.',
  'src/lib/data/attachments.ts:selectActiveAttachmentsForOwner':
    'The attachments of ONE owner row (an assignment, a submission, an announcement). ' +
    'Bounded by what a person can attach to a single item.',
  'src/lib/data/attachments.ts:selectActiveAttachmentsForOwners':
    'The same bound across a NAMED owner set - a page of items.',
  'src/lib/data/attachments.ts:selectLiveAttachmentIds':
    'A membership test over the ids passed in: which of THESE are still live.',
  'src/lib/data/attachments.ts:selectStalePendingAttachmentIds':
    'status = pending AND older than a cutoff - the reconciliation backlog, which the job ' +
    'then clears. Self-draining: a truncated read simply cleans 1000 this run and the rest ' +
    'on the next, so it converges either way.',
  'src/lib/data/tags.ts:selectTagsForEntity':
    'The tags on ONE item. Bounded by the tag catalogue, which is administered, not grown.',
  'src/lib/data/tags.ts:selectTagsForEntities':
    'The same, across a page of items - callers pass the ids they are about to render.',
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

type Finding = { key: string; table: string }

/** Split a module into exported-function bodies, which is the unit a reader reasons about
 *  ("is THIS function's read bounded?") and a stabler key than a shifting line number. */
function functionBlocks(text: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = []
  const re = /export (?:async )?function (\w+)/g
  const starts: { name: string; at: number }[] = []
  for (let m = re.exec(text); m; m = re.exec(text)) starts.push({ name: m[1], at: m.index })
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : text.length
    blocks.push({ name: starts[i].name, body: text.slice(starts[i].at, end) })
  }
  return blocks
}

function unboundedGrowingReads(): Finding[] {
  const found: Finding[] = []
  for (const file of walk('src/lib/data')) {
    const rel = relative('.', file).split(sep).join('/')
    for (const { name, body } of functionBlocks(readFileSync(file, 'utf8'))) {
      if (!/\.from\(/.test(body) || !/\.select\(/.test(body)) continue
      if (WRITE.test(body) || BOUNDED.test(body)) continue
      // A literal table, or the computed KIND[kind].table the finance documents use - which
      // is precisely why grepping for 'receipts' missed selectConvertibleDocs.
      const literal = EVER_GROWING.find((t) => body.includes(`.from('${t}')`))
      const table = literal ?? (/\.from\(KIND\[/.test(body) ? 'receipts/payslips (via KIND)' : null)
      if (table) found.push({ key: `${rel}:${name}`, table })
    }
  }
  return found
}

describe('reads over ever-growing tables are bounded', () => {
  it('every unbounded read is either bounded in the query or justified here', () => {
    const offenders = unboundedGrowingReads().filter((f) => !(f.key in BOUNDED_BY_DESIGN))
    expect(
      offenders.map((f) => `${f.key}  [${f.table}]`),
      'Unbounded read over a table that grows forever. PostgREST truncates at the row cap and ' +
        'says nothing, so the result is a wrong FIGURE rather than a short list. Page it ' +
        '(fetchAllPaged / .range) or add it to BOUNDED_BY_DESIGN with the reason it cannot grow.',
    ).toEqual([])
  })

  it('the allowlist has no stale entries', () => {
    const live = new Set(unboundedGrowingReads().map((f) => f.key))
    const stale = Object.keys(BOUNDED_BY_DESIGN).filter((k) => !live.has(k))
    expect(stale, 'Allowlisted reads that no longer exist or are now bounded - delete them').toEqual([])
  })
})
