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
 *
 * AND THE ID SET COUNTS. "Bounded by a NAMED set passed in" is only true if that SET is
 * bounded - the read inherits its caller's scope, it does not create one. The grading queue
 * is what taught this: `selectUngradedByAssignments` was declared bounded because it takes
 * an assignment-id list, while the caller built that list from EVERY class in the academy.
 * The declaration read as a considered decision and hid the case that mattered. So a reason
 * resting on a named set has to say what bounds the set, and where an academy-wide caller
 * exists, say so rather than leaving it implied.
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
  // Effective-DATED: one row per currency pair per date a rate changed, so it grows
  // with the calendar rather than with the roster. Every converted figure in the app
  // is derived from this table, which makes a silently truncated read a wrong NUMBER
  // rather than a short list.
  'exchange_rates',
  // The inclusion rule for everything below: it accumulates with TIME rather than with the
  // roster. A roster-bounded table stops growing when the academy stops growing; these do
  // not, which is exactly the shape this gate exists to catch. Keep this list in step with
  // the schema - a table added here is watched, and one left off is silently exempt.
  'comments',
  'messages',
  'conversations',
  'assignments',
  'announcements',
  'calendar_events',
  'mentee_notes',
  'attachments',
  'entity_tags',
  // `classes` is not time-accumulating, but it grows with the ACADEMY and never shrinks -
  // archived classes stay rows. A 1:1 academy carries a class per student per subject, so
  // this is the table whose id list outgrows a GET URL first. Its absence here is what let
  // selectAllClasses sit unbounded behind the Classes list and the calendar's class picker,
  // where a capped read drops classes out of a dropdown with nothing to say so.
  'classes',
  // Third sweep. `classes` above was found only because a read on it slipped through, so the
  // rest of the schema was diffed against this list rather than sampled: these all grow with
  // the ROSTER or with TIME and never shrink (an inactive enrolment, a departed profile and a
  // closed mentorship all stay rows), which is the same shape as everything above.
  'profiles',
  'enrollments',
  'class_tutors',
  'persona_assignments',
  'mentorships',
  'guardians',
  'consents',
  'resources',
  'meet_links',
  'timetable_slots',
  'receipt_lines',
  'payslip_lines',
  'conversation_participants',
  // DELIBERATELY NOT WATCHED, having now been diffed rather than assumed: billing_rates,
  // capability_overrides, document_counters, exchange_rates, org_settings, subjects, tags.
  // These are CURATED - an admin maintains them, they are sized by the academy's structure
  // rather than its history, and none of them accumulates a row per person or per event.
  // Watching them would add noise without a failure mode behind it. Move one here the moment
  // that stops being true (a per-user capability override row is the likeliest to go first).
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
  'src/lib/data/class-membership.ts:selectActiveClassIdsForTutor':
    'ONE person own membership - the classes they are enrolled in, or the ones they teach. Bounded by how much a single human can study or teach, the smallest scope in the schema.',
  'src/lib/data/class-membership.ts:selectActiveClassIdsForStudent':
    'ONE person own membership - the classes they are enrolled in, or the ones they teach. Bounded by how much a single human can study or teach, the smallest scope in the schema.',
  'src/lib/data/class-membership.ts:selectActiveTutorRowsForClass':
    'ONE class and its tutors - a class has a handful, and co-teaching is the exception.',
  'src/lib/data/class-membership.ts:selectActiveEnrollmentRowsForClass':
    'ONE class roster. Bounded by class size; this academy is largely 1:1.',
  'src/lib/data/class-membership.ts:selectActiveClassIdsForStudents':
    'The classes of a NAMED student set, and the only caller passes the mentees of ONE mentor (mentorAuthorityClassIds). Bounded by a mentoring load, not by the academy.',
  'src/lib/data/class-membership.ts:selectActiveEnrollmentsForStudents':
    'Enrolments for a NAMED student set - the mentee dashboard passes its own mentees.',
  'src/lib/data/class-membership.ts:selectActiveEnrollmentPairsByStudentIds':
    'The (student, class) edges for a NAMED student set: ONE PAGE of the /classroom roster, so bounded by the page size.',
  'src/lib/data/class-membership.ts:selectActiveEnrollmentPairsByClassIds':
    'The (student, class) edges of a NAMED class set. Both callers pass the classes ONE tutor teaches - messaging recipients, and the tutor roster on a user page.',
  'src/lib/data/class-membership.ts:selectActiveTutorIdsByClassIds':
    'The tutors of a NAMED class set; the only caller passes the classes of ONE student, to resolve who that student may message.',
  'src/lib/data/class-membership.ts:selectActiveTutorRefsByClassIds':
    'Tutors of a NAMED class set, for listMyClasses - which now runs only on the STUDENT branch of /classroom, so the set is the subjects of one student.',
  'src/lib/data/class-membership.ts:selectActiveEnrollmentRefsByClassIds':
    'Enrolments of a NAMED class set: same single caller, same bound as selectActiveTutorRefsByClassIds.',
  'src/lib/data/class-membership.ts:selectActiveTutorPairsByClassIds':
    'Tutors of a NAMED class set, and both callers are bounded by an explicit number: ONE PAGE of the roster, and the studentless-classes section, which slices to UNASSIGNED_CAP.',
  'src/lib/data/class-membership.ts:selectActiveStudentIdsByClassIds':
    'Students of a NAMED class set. The academy-wide readers of both callers (/classroom and /session-timings) resolve to NULL and page the profile directory instead, so this never receives every class - only a mentor-sized set.',
  'src/lib/data/class-membership.ts:selectActiveTeachingProfileIds':
    'Of a NAMED profile set, which of them teach. Bounded by the set passed in: a page of the user directory.',
  'src/lib/data/guardians.ts:selectGuardiansByStudent':
    'The guardians of ONE student - a person has very few, and this table is only ever asked per student.',
  'src/lib/data/mentorships.ts:selectActiveMenteeIds': 'The active mentees of ONE mentor. Bounded by a mentoring load.',
  'src/lib/data/mentorships.ts:selectActiveMentorIdsForStudent':
    'The mentors of ONE student - typically one; there is no bulk-assignment path.',
  'src/lib/data/mentorships.ts:selectActiveMentorshipsForStudents':
    'Mentorships for a NAMED student set: a page of the roster, or the mentees of one mentor.',
  'src/lib/data/messages-participants.ts:selectParticipantIds':
    'The participants of ONE conversation. Bounded by the thread.',
  'src/lib/data/messages-participants.ts:selectParticipantsForConversations':
    'Participants of a NAMED conversation set - the page of threads being rendered.',
  'src/lib/data/personas.ts:selectScopedMenteeIds':
    'The student-scoped persona rows of ONE mentor. Bounded by mentee count.',
  'src/lib/data/personas.ts:selectActivePersonaAssignments':
    'The personas of ONE profile - a handful, fixed at creation.',
  'src/lib/data/personas.ts:selectOwnActivePersonas': 'The personas of the CALLER. Same bound, read through RLS.',
  'src/lib/data/personas.ts:selectActivePersonaAssignmentsByProfileIds':
    'Personas for a NAMED profile set - a page of the user directory, each holding a handful.',
  'src/lib/data/profiles-auth.ts:selectActiveIdsAmong':
    'Of a NAMED id set, which are active. Bounded by the set passed in, and its widest caller (the persona expansion) is itself paged.',
  'src/lib/data/profiles-directory.ts:selectProfilesLiteByIds':
    'Name and email for a NAMED id set - the ids already on the page being rendered.',
  'src/lib/data/classes.ts:selectClassesByIds':
    'A NAMED class set, and both callers bound it: listMyClasses now runs only on the ' +
    "STUDENT branch of /classroom (their own subjects), and the calendar's picker passes a " +
    "tutor's own classes - its academy-wide reader takes the myClassScope null path instead " +
    'of listing ids.',
  'src/lib/data/classes.ts:selectClassNamesByIdsAsService':
    "Label lookup for ONE student's report card: their enrolments plus the classes their own " +
    'graded assignments belong to. Bounded by one student, not by the academy.',
  'src/lib/data/classes.ts:selectActiveClassIdsAmong':
    'Trims a NAMED set to its active members, and every caller passes a bounded one: a ' +
    "mentor's mentee classes, or a tutor's own. The academy-wide readers of both callers " +
    'resolve to null (no predicate) before reaching here - see myClassScope.',
  'src/lib/data/classes.ts:selectClassesByIdsAsCaller':
    'Two callers, both bounded by an explicit number. The roster pass takes the classes of ' +
    'ONE PAGE of students. The studentless-classes section used to pass every orphan an ' +
    'admin could see - not a bounded quantity - and now slices to UNASSIGNED_CAP, reporting ' +
    'the true total beside it so the cap is stated rather than silent.',
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
    'The ungraded submissions of a NAMED assignment set, one per student each. The SET is ' +
    'now bounded too: the grading queue resolves one class before reading, so an admin no ' +
    'longer arrives here with every assignment in the academy (see page-data/grading).',
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
    'Active submissions for a NAMED assignment set - at most one per enrolled student each. ' +
    "Callers pass one class's assignments or one student's, both roster-bounded.",
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
    'close, rather than a history that accumulates. The SET is bounded at both callers, ' +
    'traced rather than assumed: the mentor dashboard passes the classes of ONE mentor own ' +
    'mentees (studentIdsOfMentor -> selectScopedMenteeIds, no oversight branch), and the ' +
    'mentee list passes one student classes.',
  'src/lib/data/assignments.ts:selectAssignmentsByIdsAsService':
    'Bounded by the ids passed in, which come from a page of submissions.',
  'src/lib/data/class-sessions.ts:selectSessionsByIds':
    'Bounded by construction: at most one PAGE of attendance-record rows supplies the ids. ' +
    'It exists to replace a flat newest-N read that gave the record pager and its session ' +
    'context different horizons.',
  'src/lib/data/messages-conversations.ts:selectConversationReadState':
    'Three narrow columns over the caller OWN conversation ids, passed in - the same bounded ' +
    'set selectMyParticipations returns. It exists to resolve "unread" before paging, ' +
    'because unread compares a conversation last_message_at against the reader own ' +
    'watermark and so cannot be a column filter.',
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

/**
 * Tables that do NOT grow with time, each with the thing that bounds them.
 *
 * This list exists so the watch list above cannot silently fall behind the schema. It was
 * hand-maintained against a schema that kept growing, and `exchange_rates` sat outside it
 * unnoticed - effective-dated, read whole, and feeding every converted figure in the app.
 * Nothing failed, because nothing was checking that the two lists together covered
 * everything. Now a new table forces a decision: watch it, or say here why it is bounded.
 */
const ROSTER_OR_CATALOGUE_BOUNDED: Record<string, string> = {
  billing_rates: 'One row per profile - profile_id IS the primary key. Bounded by the roster.',
  capability_overrides: 'One row per (profile, capability). Bounded by the roster.',
  document_counters: 'One row per (doc_type, year) - two a year, and allocated by RPC, never scanned.',
  org_settings: 'A singleton; the id column is CHECKed to a single true value.',
  subjects: 'The subject catalogue, name-unique. Bounded by what the academy teaches.',
  tags: 'The tag catalogue, name-unique. Bounded by what staff create.',
}

/** Every table the migration chain creates, renames followed and drops honoured. */
function tablesCreatedInChain(): string[] {
  const live = new Set<string>()
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
    for (const m of sql.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      live.add(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(/drop table\s+(?:if exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      live.delete(m[1].toLowerCase())
    }
    for (const m of sql.matchAll(
      /alter table\s+(?:if exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+rename to\s+"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      const [from, to] = [m[1].toLowerCase(), m[2].toLowerCase()]
      if (live.delete(from)) live.add(to)
    }
  }
  // A guard on the SCAN, not on the schema. Both tests below reason about what this set does
  // NOT contain - a table nobody watches, a listed table the chain no longer creates - so an
  // incomplete read does not fail them honestly, it fails them with the wrong reason and
  // sends the reader to edit a correct list. The chain creates dozens of tables and only ever
  // grows, so a handful means the read was short, not that the schema shrank.
  if (live.size < 20) {
    throw new Error(
      `Migration scan found only ${live.size} tables, which cannot be right - treat the two ` +
        'assertions below as unreliable rather than editing the lists they name.',
    )
  }
  return [...live].sort()
}

describe('the watch list keeps up with the schema', () => {
  it('every table in the chain is either watched or declared bounded', () => {
    const watched = new Set<string>(EVER_GROWING)
    const undecided = tablesCreatedInChain().filter((t) => !watched.has(t) && !(t in ROSTER_OR_CATALOGUE_BOUNDED))
    expect(
      undecided,
      'These tables are in the migration chain but appear in neither list, so reads over them ' +
        'are exempt from this gate by accident rather than by decision. Add each to ' +
        'EVER_GROWING (it accumulates with time) or to ROSTER_OR_CATALOGUE_BOUNDED with the ' +
        'thing that bounds it.',
    ).toEqual([])
  })

  it('nothing is declared bounded that is also watched, and neither list names a dead table', () => {
    const inChain = new Set(tablesCreatedInChain())
    const both = EVER_GROWING.filter((t) => t in ROSTER_OR_CATALOGUE_BOUNDED)
    expect(both, 'A table cannot be both watched and declared bounded').toEqual([])
    const dead = [...EVER_GROWING, ...Object.keys(ROSTER_OR_CATALOGUE_BOUNDED)].filter((t) => !inChain.has(t))
    expect(dead, 'Listed tables that the chain no longer creates - delete them').toEqual([])
  })
})
