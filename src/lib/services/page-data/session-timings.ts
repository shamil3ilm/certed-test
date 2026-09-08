import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { isUuid } from '@/lib/validation/id'
import { isCalendarDate } from '@/lib/time/format'
import {
  listMenteeSessionTimings,
  listSessionTimingsByStudents,
  type MenteeSessionTiming,
  type SessionTimingFilters,
  type StudentSessionGroup,
} from '@/lib/services/mentor-session-timings'
import { selectActiveSubjects } from '@/lib/data/subjects'
import { selectActiveClassIdsForStudent, selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
import { selectProfilePage } from '@/lib/data/profiles-directory'
import { mentoringScopeClassIds, isMentoringOversight } from '@/lib/permission/class'
import { listActiveByRole } from '@/lib/services/users'

/**
 * Page data for the session-timing list: parse the filters, page, and gather the
 * option lists the filter bar offers.
 *
 * WHY STUDENT AND NOT CLASS in the filter bar: the reader's question is "this tutor across
 * their subjects and students", and in a 1:1 academy a class IS (student, subject) - so
 * Student + Subject names the same thing a class dropdown would, from the two words a human
 * actually holds. Both option lists stay small; a class list would carry one entry per
 * student per subject and grow as their product. `classId` is still honoured when it
 * arrives in the URL, so a link from a class page still drills in.
 */

const PAGE_SIZE = 20

/** Students per page in the GROUPED view. Matches /classroom's roster page so the two
 *  student-first lists page at the same rate. */
const ROSTER_PAGE_SIZE = 12

/** Sessions shown inside one student's group before it defers to "See all".
 *  The group is a summary, not the archive - the archive is one click away, and capping
 *  here is what keeps a student with a year of daily sessions from filling the screen. */
const PER_STUDENT = 5

export type SessionTimingSearchParams = {
  page?: string
  student?: string
  subject?: string
  tutor?: string
  classId?: string
  from?: string
  to?: string
}

export type SessionTimingFilterState = {
  page: number
  student: string
  subject: string
  tutor: string
  classId: string
  from: string
  to: string
}

export type SessionTimingsPageData = {
  filters: SessionTimingFilterState
  hasActiveFilters: boolean
  /** Flat rows - the drill-in view for ONE student, and what a student-filtered URL opens.
   *  Empty in the grouped view. */
  items: MenteeSessionTiming[]
  /** Student-first groups - the default view. Empty once a student filter is applied. */
  groups: StudentSessionGroup[]
  /** True while showing groups; false in the flat per-student drill-in. */
  groupView: boolean
  /** Rows shown per group before "See all" - the page states its own cap rather than
   *  silently truncating. */
  perStudent: number
  total: number
  totalPages: number
  options: {
    students: { id: string; name: string }[]
    subjects: { id: string; name: string }[]
    tutors: { id: string; name: string }[]
  }
}

/** A URL carrying the current filters, overriding only `patch`. Defaults are omitted so an
 *  unfiltered list has a clean URL - and so the Clear link is just the bare path. */
export function sessionTimingsUrl(
  filters: SessionTimingFilterState,
  patch: Partial<SessionTimingFilterState> = {},
): string {
  const next = { ...filters, ...patch }
  const sp = new URLSearchParams()
  if (next.page > 1) sp.set('page', String(next.page))
  if (next.student) sp.set('student', next.student)
  if (next.subject) sp.set('subject', next.subject)
  if (next.tutor) sp.set('tutor', next.tutor)
  if (next.classId) sp.set('classId', next.classId)
  if (next.from) sp.set('from', next.from)
  if (next.to) sp.set('to', next.to)
  const query = sp.toString()
  return query ? `/session-timings?${query}` : '/session-timings'
}

/** A search param that must be a uuid to mean anything. A malformed one is DROPPED rather
 *  than passed through: PostgREST answers a bad uuid with a 400, so a hand-edited URL would
 *  turn a filter into an error page instead of an unfiltered list. */
const uuidParam = (raw?: string): string => (raw && isUuid(raw) ? raw : '')

/** Same idea for a date: anything that is not 'YYYY-MM-DD' is ignored. */
const dateParam = (raw?: string): string => (raw && isCalendarDate(raw) ? raw : '')

/**
 * The students this actor's grouped view may page through - or null for "every student",
 * which is what an academy-wide reader gets.
 *
 * Null is not a shortcut: an admin must NOT travel as a list of every student id, or the
 * roster query carries one uuid per student in its URL. That is the same rule /classroom
 * follows, and the same reason the filter bar offers Student rather than Class.
 */
async function rosterStudentIds(actor: Profile): Promise<string[] | null> {
  if (await isMentoringOversight(actor.id)) return null
  const classIds = await mentoringScopeClassIds(actor)
  return [...new Set(await selectActiveStudentIdsByClassIds(classIds))]
}

export async function loadSessionTimingsPageData(
  actor: Profile,
  searchParams?: SessionTimingSearchParams,
): Promise<SessionTimingsPageData> {
  const student = uuidParam(searchParams?.student)
  const filters: SessionTimingFilterState = {
    page: parsePageParam(searchParams?.page),
    student,
    subject: uuidParam(searchParams?.subject),
    tutor: uuidParam(searchParams?.tutor),
    classId: uuidParam(searchParams?.classId),
    from: dateParam(searchParams?.from),
    to: dateParam(searchParams?.to),
  }
  const hasActiveFilters = Boolean(
    filters.student || filters.subject || filters.tutor || filters.classId || filters.from || filters.to,
  )

  // A student narrows to THEIR classes. One student has a handful, so this stays a short
  // `.in()` - the reason the filter bar offers Student rather than Class in the first place.
  const studentClassIds = student ? await selectActiveClassIdsForStudent(student) : null
  const query: SessionTimingFilters = {
    classId: filters.classId || undefined,
    subjectId: filters.subject || undefined,
    tutorId: filters.tutor || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }

  // A student with no active class matches nothing - and must not fall through to the
  // UNFILTERED list, which is what dropping an empty array would do.
  const noMatches = studentClassIds != null && studentClassIds.length === 0

  const fetchPage = (page: number) =>
    noMatches
      ? Promise.resolve({ items: [], total: 0 })
      : listMenteeSessionTimings(actor, {
          page,
          pageSize: PAGE_SIZE,
          filters: studentClassIds ? { ...query, studentClassIds } : query,
        })

  const [subjects, tutors, students] = await Promise.all([
    selectActiveSubjects(),
    listActiveByRole('tutor'),
    listActiveByRole('student'),
  ])
  const options = {
    students,
    subjects: subjects.map((sub) => ({ id: sub.id, name: sub.name })),
    tutors,
  }

  // FLAT VIEW - one student's full history, newest first. This is what a group's "See all"
  // opens, and it is why the groups can afford to cap: nothing is unreachable, it is one
  // click away. Paging here counts SESSIONS, because the reader has already narrowed to a
  // single student and recency is the question they are asking.
  if (filters.student) {
    const page = await fetchPage(filters.page)
    // Fold a stale `?page=999` back onto the last real page rather than showing a blank
    // list with no way back but editing the URL. Costs a second read ONLY when the param
    // was out of range - a hand-edited or bookmarked URL, not the normal path.
    const currentPage = clampPage(filters.page, page.total, PAGE_SIZE)
    const items = currentPage === filters.page ? page.items : (await fetchPage(currentPage)).items
    return {
      filters: { ...filters, page: currentPage },
      hasActiveFilters,
      items,
      groups: [],
      groupView: false,
      perStudent: PER_STUDENT,
      total: page.total,
      totalPages: totalPages(page.total, PAGE_SIZE),
      options,
    }
  }

  // GROUPED VIEW - the default. Paging counts STUDENTS, not sessions, which is what buys
  // the property a session-paged list could never have: a student's sessions are never
  // split across a page boundary, because the page IS a set of students. Same reasoning
  // /classroom records for its roster paging.
  const scopedIds = await rosterStudentIds(actor)
  const readRoster = (page: number) =>
    selectProfilePage('student', {
      page,
      pageSize: ROSTER_PAGE_SIZE,
      ...(scopedIds ? { ids: scopedIds } : {}),
      sortBy: 'name',
      sortOrder: 'asc',
    })
  const firstRoster = await readRoster(filters.page)
  const currentPage = clampPage(filters.page, firstRoster.total, ROSTER_PAGE_SIZE)
  const roster = currentPage === filters.page ? firstRoster : await readRoster(currentPage)

  // The filters travel INTO the groups: every per-student read below carries `query`, so
  // subject / tutor / date narrow what each student shows and that student's total alike.
  // A student with nothing matching still renders - as an explicit "no sessions match"
  // row, not a blank card - because dropping them would make the roster pager lie about
  // how many students the page holds.
  const groups = await listSessionTimingsByStudents(actor, {
    studentIds: roster.items.map((r) => r.id),
    perStudent: PER_STUDENT,
    filters: query,
  })

  return {
    filters: { ...filters, page: currentPage },
    hasActiveFilters,
    items: [],
    groups,
    groupView: true,
    perStudent: PER_STUDENT,
    total: roster.total,
    totalPages: totalPages(roster.total, ROSTER_PAGE_SIZE),
    options,
  }
}
