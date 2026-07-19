import type { Profile } from '@/lib/auth/profile'
import { listAssignments } from '@/lib/services/assignments'
import { getClass, myClassIds } from '@/lib/services/classes'
import { listUngradedSubmissions } from '@/lib/services/submissions'
import { getProfileNamesByIds } from '@/lib/services/users'

export type GradingSearchParams = { q?: string; classId?: string }

export type GradingQueueItem = {
  id: string
  assignmentId: string
  assignmentTitle: string
  studentId: string
  studentName: string
  submittedAt: string
  status: string
}

export type GradingQueueSection = {
  classId: string
  className: string
  items: GradingQueueItem[]
}

export type GradingQueuePageData = {
  totalUngraded: number
  query?: string
  classFilter?: string
  classOptions: { id: string; name: string }[]
  sections: GradingQueueSection[]
  filteredCount: number
}

/** Loads and shapes the grading queue so the page only renders filters + groups. */
export async function loadGradingQueuePageData(
  me: Profile,
  searchParams?: GradingSearchParams,
): Promise<GradingQueuePageData> {
  const classIds = await myClassIds(me)
  const assignments = classIds.length ? await listAssignments({ classIds }) : []
  const assignmentsById = new Map(assignments.map((a) => [a.id, a]))
  const allUngraded = await listUngradedSubmissions(assignments.map((a) => a.id))

  const [names, classes] = await Promise.all([
    getProfileNamesByIds(allUngraded.map((s) => s.student_id)),
    Promise.all([...new Set(assignments.map((a) => a.class_id))].map((id) => getClass(id))),
  ])
  const classNameById = new Map(classes.filter(Boolean).map((c) => [c!.id, c!.name]))

  const query = searchParams?.q?.trim().toLowerCase() || undefined
  const classFilter = searchParams?.classId || undefined
  const filtered = allUngraded.filter((s) => {
    const assignment = assignmentsById.get(s.assignment_id)
    if (classFilter && assignment?.class_id !== classFilter) return false
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

  return {
    totalUngraded: allUngraded.length,
    query,
    classFilter,
    classOptions: [...classNameById.entries()].map(([id, name]) => ({ id, name })),
    sections,
    filteredCount: filtered.length,
  }
}
