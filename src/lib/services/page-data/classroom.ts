import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { myClassIds, type ClassSummary } from '@/lib/services/classes'
import { listMyClasses } from '@/lib/services/classes'
import { entityIdsForTag, tagsForEntities } from '@/lib/services/tags'
import { selectProfilePage } from '@/lib/data/profiles-directory'
import { selectClassesByIdsAsCaller, selectClassIdsBySubject, selectVisibleClassIds } from '@/lib/data/classes'
import {
  countActiveEnrollmentsPerClass,
  selectActiveEnrollmentPairsByStudentIds,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorPairsByClassIds,
} from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import type { Tag } from '@/lib/services/tags'

/**
 * Page data for the Classes list.
 *
 * THE PAGER COUNTS STUDENTS, NOT CLASSES. Every staff view of this page groups classes
 * under the student they are for, ordered by the student's NAME - and that name lives in
 * `profiles`, reached through `enrollments`. Neither is a column on `classes`, so ordering
 * classes in SQL was impossible; the page fetched every class the caller could see and
 * sorted the array, which PostgREST silently truncated at its Max rows.
 *
 * Paging the STUDENT roster instead puts the sort and the search where they belong, and has
 * a property class-paging never could: a student's subjects cannot be split across a page
 * boundary, because the page IS a set of students.
 *
 * The RLS gate is preserved. The list used to pre-resolve "every class this person may
 * read" (selectVisibleClassIds) so a link could never 404; a page of students cannot use a
 * precomputed set, so the classes are read through the CALLER'S OWN session instead
 * (selectClassesByIdsAsCaller). Same gate, applied directly rather than in advance.
 */

const CLASSES_PAGE_SIZE = 12

export type ClassroomSearchParams = { error?: string; tag?: string; subject?: string; page?: string; q?: string }

export type ClassroomFilters = { page: number; tag: string; subject: string; q: string }

export type ClassroomStudentGroup = { key: string; label: string; classes: ClassSummary[] }

export type ClassroomPageData = {
  filters: ClassroomFilters
  hasActiveFilters: boolean
  /** Grouped student-first view (staff). Empty for a student's own flat list. */
  groups: ClassroomStudentGroup[]
  /** The flat list a STUDENT sees of their own classes - bounded by their own subjects. */
  ownClasses: ClassSummary[]
  /** Classes with NO active student. They belong to no roster group, so paging by student
   *  would drop them entirely - see unassignedClasses. Page 1 of a staff view only. */
  unassigned: ClassSummary[]
  groupByStudentView: boolean
  tagsByClass: Map<string, Tag[]>
  /** Students matching the filters (staff view) - what the pager counts. */
  total: number
  totalPages: number
  flags: Awaited<ReturnType<typeof loadPersonaFlags>>
}

/** A /classroom URL carrying the current filters, overriding only `patch`. */
export function classroomUrl(filters: ClassroomFilters, patch: Partial<ClassroomFilters> = {}): string {
  const next = { ...filters, ...patch }
  const sp = new URLSearchParams()
  if (next.tag) sp.set('tag', next.tag)
  if (next.subject) sp.set('subject', next.subject)
  if (next.q) sp.set('q', next.q)
  if (next.page > 1) sp.set('page', String(next.page))
  const query = sp.toString()
  return query ? `/classroom?${query}` : '/classroom'
}

/**
 * The class ids a filter admits, or null when that filter is not applied.
 *
 * Both reads are bounded by the filter itself - the classes teaching one subject, or the
 * classes carrying one tag - rather than by the academy, and neither runs unless the filter
 * is actually set.
 */
async function filteredClassIds(subject: string, tag: string): Promise<Set<string> | null> {
  if (!subject && !tag) return null
  const [bySubject, byTag] = await Promise.all([
    subject ? selectClassIdsBySubject(subject) : Promise.resolve(null),
    tag ? entityIdsForTag('class', tag) : Promise.resolve(null),
  ])
  if (bySubject && byTag) {
    const tagged = new Set(byTag)
    return new Set(bySubject.filter((id) => tagged.has(id)))
  }
  return new Set(bySubject ?? byTag ?? [])
}

/**
 * The students whose classes this caller may see, as an id list - or null for "every
 * student", which is what an academy-wide reader gets.
 *
 * Null matters: an admin must NOT travel as a list of every student id, or the roster query
 * carries one uuid per student in its URL. Everyone else is scoped to the students of their
 * own classes, which is bounded by their teaching or mentoring load.
 */
async function scopeStudentIds(me: Profile, isAcademyWide: boolean): Promise<string[] | null> {
  if (isAcademyWide) return null
  return [...new Set(await selectActiveStudentIdsByClassIds(await myClassIds(me)))]
}

export async function loadClassroomPageData(
  me: Profile,
  searchParams?: ClassroomSearchParams,
): Promise<ClassroomPageData> {
  const flags = await loadPersonaFlags(me.id)
  const filters: ClassroomFilters = {
    page: parsePageParam(searchParams?.page),
    tag: searchParams?.tag ?? '',
    subject: searchParams?.subject ?? '',
    q: searchParams?.q?.trim() ?? '',
  }
  const hasActiveFilters = Boolean(filters.tag || filters.subject || filters.q)

  // A student sees their OWN classes as a flat per-subject list - bounded by the subjects
  // they take, so there is nothing to page and no student roster to build.
  if (flags.isStudent) {
    const own = await listMyClasses(me)
    const admitted = await filteredClassIds(filters.subject, filters.tag)
    const ownClasses = admitted ? own.filter((c) => admitted.has(c.id)) : own
    return {
      filters,
      hasActiveFilters,
      groups: [],
      ownClasses,
      // A student's own list is already every class they are in; there is no roster to be
      // outside of, so the unassigned section does not apply.
      unassigned: [],
      groupByStudentView: false,
      tagsByClass: await tagsForEntities(
        'class',
        ownClasses.map((c) => c.id),
      ),
      total: ownClasses.length,
      totalPages: 1,
      flags,
    }
  }

  const isAcademyWide = flags.isClassAdmin
  const admitted = await filteredClassIds(filters.subject, filters.tag)
  let scopedIds = await scopeStudentIds(me, isAcademyWide)

  // A subject or tag filter narrows the ROSTER too - otherwise a page could be filled with
  // students whose classes all fell out of the filter, and render as blank groups.
  if (admitted) {
    const admittedStudents = new Set(await selectActiveStudentIdsByClassIds([...admitted]))
    scopedIds = scopedIds ? scopedIds.filter((id) => admittedStudents.has(id)) : [...admittedStudents]
  }

  const readRoster = (page: number) =>
    selectProfilePage('student', {
      page,
      pageSize: CLASSES_PAGE_SIZE,
      ...(scopedIds ? { ids: scopedIds } : {}),
      search: filters.q || undefined,
      sortBy: 'name',
      sortOrder: 'asc',
    })

  const first = await readRoster(filters.page)
  const currentPage = clampPage(filters.page, first.total, CLASSES_PAGE_SIZE)
  const roster = currentPage === filters.page ? first : await readRoster(currentPage)

  // Studentless classes belong to no page of the roster, so they are surfaced once - on
  // page 1. A name search is a search for a STUDENT, so it correctly excludes them; a
  // subject or tag filter still applies, via `admitted`.
  const [groups, unassigned] = await Promise.all([
    buildGroups(roster.items, admitted),
    currentPage === 1 && !filters.q ? unassignedClasses(admitted) : Promise.resolve([]),
  ])
  return {
    filters: { ...filters, page: currentPage },
    hasActiveFilters,
    groups,
    ownClasses: [],
    unassigned,
    groupByStudentView: true,
    tagsByClass: await tagsForEntities('class', [
      ...groups.flatMap((g) => g.classes.map((c) => c.id)),
      ...unassigned.map((c) => c.id),
    ]),
    total: roster.total,
    totalPages: totalPages(roster.total, CLASSES_PAGE_SIZE),
    flags,
  }
}

/**
 * Classes with no ACTIVE student.
 *
 * Paging by student cannot reach these: they belong to no roster group, so without this
 * they would vanish from the list entirely. The previous class-paged view did show them,
 * grouped under "Unassigned" and sorted last - and unenrolling a student
 * (deactivateEnrollment) is an ordinary admin action, so this is a reachable state, not a
 * theoretical one.
 *
 * Both reads are RLS-scoped and id/count-only, and both are COMPLETE (fetchAllPaged inside
 * selectVisibleClassIds, an aggregate for the counts) - a truncated either side would
 * invent orphans that do not exist, or hide ones that do.
 */
async function unassignedClasses(admitted: Set<string> | null): Promise<ClassSummary[]> {
  const [visibleIds, counts] = await Promise.all([selectVisibleClassIds(), countActiveEnrollmentsPerClass()])
  // The count RPC groups enrolments, so a class with none is simply absent from it - which
  // is exactly the set we want.
  const orphanIds = visibleIds.filter((id) => !counts.has(id) && (!admitted || admitted.has(id)))
  if (orphanIds.length === 0) return []
  const [classes, tutorPairs] = await Promise.all([
    selectClassesByIdsAsCaller(orphanIds),
    selectActiveTutorPairsByClassIds(orphanIds),
  ])
  const names = await getProfileNamesByIds([...new Set(tutorPairs.map((p) => p.tutor_id))])
  const tutorsByClass = new Map<string, { id: string; name: string }[]>()
  for (const p of tutorPairs) {
    tutorsByClass.set(p.class_id, [
      ...(tutorsByClass.get(p.class_id) ?? []),
      { id: p.tutor_id, name: names.get(p.tutor_id) ?? 'Unknown' },
    ])
  }
  return classes.map((c) => {
    const tutors = tutorsByClass.get(c.id) ?? []
    return { ...c, tutorCount: tutors.length, studentCount: 0, students: [], tutors }
  })
}

/** Each rostered student with their classes beneath them, in roster order. */
async function buildGroups(
  students: Array<{ id: string; full_name: string | null; email: string }>,
  admitted: Set<string> | null,
): Promise<ClassroomStudentGroup[]> {
  if (students.length === 0) return []
  const studentIds = students.map((s) => s.id)
  const pairs = await selectActiveEnrollmentPairsByStudentIds(studentIds)
  const wanted = [...new Set(pairs.map((p) => p.class_id))].filter((id) => !admitted || admitted.has(id))

  // Read through the CALLER'S session: RLS decides what may appear, so a link can never
  // outlive the permission to open it.
  const [classes, tutorPairs] = await Promise.all([
    selectClassesByIdsAsCaller(wanted),
    selectActiveTutorPairsByClassIds(wanted),
  ])
  const readable = new Set(classes.map((c) => c.id))
  const names = await getProfileNamesByIds([...new Set([...studentIds, ...tutorPairs.map((p) => p.tutor_id)])])

  const tutorsByClass = new Map<string, { id: string; name: string }[]>()
  for (const p of tutorPairs) {
    if (!readable.has(p.class_id)) continue
    tutorsByClass.set(p.class_id, [
      ...(tutorsByClass.get(p.class_id) ?? []),
      { id: p.tutor_id, name: names.get(p.tutor_id) ?? 'Unknown' },
    ])
  }

  const classById = new Map(classes.map((c) => [c.id, c]))
  const groups: ClassroomStudentGroup[] = []
  for (const student of students) {
    const studentBrief = { id: student.id, name: names.get(student.id) ?? student.full_name ?? student.email }
    const mine = pairs
      .filter((p) => p.student_id === student.id && readable.has(p.class_id))
      .map((p) => classById.get(p.class_id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .sort((a, b) => a.name.localeCompare(b.name))
    // A student with no classes LEFT after the filter is dropped, not shown empty. Without a
    // filter they are kept: "enrolled in nothing yet" is a real state an admin needs to see.
    if (mine.length === 0 && admitted) continue
    groups.push({
      key: student.id,
      label: studentBrief.name,
      classes: mine.map((c) => {
        const tutors = tutorsByClass.get(c.id) ?? []
        return { ...c, tutorCount: tutors.length, studentCount: 1, students: [studentBrief], tutors }
      }),
    })
  }
  return groups
}
