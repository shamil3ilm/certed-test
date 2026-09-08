import type { Profile } from '@/lib/auth/profile'
import { listAssignments } from '@/lib/services/assignments'
import { listClassesByIds, myClassIds } from '@/lib/services/classes'
import { listUngradedSubmissions } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

type GradingSearchParams = { q?: string; classId?: string }

type GradingQueueItem = {
  id: string
  assignmentId: string
  assignmentTitle: string
  studentId: string
  studentName: string
  submittedAt: string
  status: string
}

type GradingQueueSection = {
  classId: string
  className: string
  items: GradingQueueItem[]
}

type GradingQueuePageData = {
  query?: string
  classFilter?: string
  sections: GradingQueueSection[]
  filteredCount: number
}

/** Loads and shapes the grading queue so the page only renders filters + groups. */
export async function loadGradingQueuePageData(
  me: Profile,
  searchParams?: GradingSearchParams,
): Promise<GradingQueuePageData> {
  // Scope BEFORE the read, not after it. The queue is opened one class at a time - the
  // /grading landing is a class picker and the class tab passes its own id - but this used
  // to load every class's assignments and every ungraded submission in the academy, then
  // discard all but one class's worth. For an admin `myClassIds` IS every class, so both
  // the work and the `.in()` list carrying it grew with the academy to answer a question
  // about one class.
  const mine = await myClassIds(me)
  const classFilter = searchParams?.classId || undefined
  // A filter naming a class the caller cannot reach yields nothing, rather than silently
  // widening back to their whole scope.
  const classIds = classFilter ? (mine.includes(classFilter) ? [classFilter] : []) : mine
  // activeOnly: archiving an assignment must also drop its ungraded submissions
  // from the "to review" queue - otherwise archived work lingers there forever.
  const assignments = classIds.length ? await listAssignments({ classIds, activeOnly: true }) : []
  const assignmentsById = new Map(assignments.map((a) => [a.id, a]))
  // No assignments in scope means no queue - skip the round trip rather than asking for
  // the ungraded submissions of an empty set.
  const allUngraded = assignments.length ? await listUngradedSubmissions(assignments.map((a) => a.id)) : []

  const [names, classes] = await Promise.all([
    getProfileNamesByIds(allUngraded.map((s) => s.student_id)),
    // One set-based read for every class with ungraded work, not one query per
    // class (which, for an admin, would scale with the whole academy).
    listClassesByIds([...new Set(assignments.map((a) => a.class_id))]),
  ])
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))

  const query = searchParams?.q?.trim().toLowerCase() || undefined
  // Class narrowing already happened in the query above; only the free-text search runs
  // here, because it spans a student's NAME and an assignment's TITLE - two other tables -
  // and neither is worth a join for a queue this size.
  const filtered = allUngraded.filter((s) => {
    const assignment = assignmentsById.get(s.assignment_id)
    if (!query) return true
    const name = (names.get(s.student_id) ?? '').toLowerCase()
    const title = (assignment?.title ?? '').toLowerCase()
    return name.includes(query) || title.includes(query)
  })

  const grouped = new Map<string, GradingQueueItem[]>()
  for (const submission of filtered) {
    const assignment = assignmentsById.get(submission.assignment_id)
    if (!assignment) continue
    const list = grouped.get(assignment.class_id) ?? []
    list.push({
      id: submission.id,
      assignmentId: submission.assignment_id,
      assignmentTitle: assignment.title,
      studentId: submission.student_id,
      studentName: names.get(submission.student_id) ?? 'Student',
      submittedAt: submission.submitted_at,
      status: submission.status,
    })
    grouped.set(assignment.class_id, list)
  }

  const sections = [...grouped.entries()].map(([classId, items]) => ({
    classId,
    className: classNameById.get(classId) ?? 'Class',
    items: items.slice().sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1)),
  }))

  return { query, classFilter, sections, filteredCount: filtered.length }
}
