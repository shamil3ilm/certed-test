import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { isUuid } from '@/lib/validation/id'
import { isCalendarDate } from '@/lib/time/format'
import {
  listMenteeSessionTimings,
  type MenteeSessionTiming,
  type SessionTimingFilters,
} from '@/lib/services/mentor-session-timings'
import { selectActiveSubjects } from '@/lib/data/subjects'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
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
  items: MenteeSessionTiming[]
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

  const [page, subjects, tutors, students] = await Promise.all([
    fetchPage(filters.page),
    selectActiveSubjects(),
    listActiveByRole('tutor'),
    listActiveByRole('student'),
  ])

  // Fold a stale `?page=999` back onto the last real page rather than showing a blank list
  // with no way back but editing the URL. Costs a second read ONLY when the param was out
  // of range, which is a hand-edited or bookmarked URL, not the normal path.
  const currentPage = clampPage(filters.page, page.total, PAGE_SIZE)
  const items = currentPage === filters.page ? page.items : (await fetchPage(currentPage)).items

  return {
    filters: { ...filters, page: currentPage },
    hasActiveFilters,
    items,
    total: page.total,
    totalPages: totalPages(page.total, PAGE_SIZE),
    options: {
      students,
      subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
      tutors,
    },
  }
}
