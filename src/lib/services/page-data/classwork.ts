import type { Profile } from '@/lib/auth/profile'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAssignments, type Assignment } from '@/lib/services/assignments'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listResourcesPage, type Resource } from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions, type Submission } from '@/lib/services/submissions'

const MATERIALS_PAGE_SIZE = 10
const ARCHIVED_PAGE_SIZE = 20

type ClassworkSearchParams = { matPage?: string; matQ?: string }

type ClassworkAssignmentView = {
  assignment: Assignment
  submission: Submission | undefined
  submissionComments: Comment[]
  /** The student's own prior (replaced) versions for this assignment, newest first. */
  submissionHistory: Submission[]
  /** A hard-deadline assignment whose due instant has passed: submissions closed. */
  deadlineClosed: boolean
}

type ClassworkResourceView = {
  resource: Resource
  comments: Comment[]
}

type ClassworkPageData = {
  canManage: boolean
  canManageContent: boolean
  isStudent: boolean
  isArchived: boolean
  now: number
  classList: { id: string; name: string }[]
  materialsPage: number
  materialsQuery?: string
  materialsTotal: number
  materialsTotalPages: number
  assignmentViews: ClassworkAssignmentView[]
  resourceViews: ClassworkResourceView[]
  archivedResources: Resource[]
}

export function classworkPageUrl(page: number, search?: string): string {
  const sp = new URLSearchParams()
  if (page > 1) sp.set('matPage', String(page))
  if (search) sp.set('matQ', search)
  const query = sp.toString()
  return query ? `?${query}` : '?'
}

/** Loads and shapes the classwork page so the page only renders forms + lists. */
export async function loadClassworkPageData(
  me: Profile,
  course: { id: string; name: string; status: 'active' | 'archived' },
  searchParams?: ClassworkSearchParams,
): Promise<ClassworkPageData> {
  const [{ isStudent }, canManage] = await Promise.all([loadPersonaFlags(me.id), canManageClass(me, course.id)])
  const isArchived = course.status === 'archived'
  const canManageContent = canManage && !isArchived
  // Student and tutor/manager are mutually exclusive by construction - a student
  // can't be made a class tutor (addTutor requires role tutor|mentor) and a tutor
  // can't be enrolled (enrolStudent requires role student) - so a student never
  // manages a class. No hybrid student+manager to guard against.
  const isStudentView = isStudent
  const classList = [{ id: course.id, name: course.name }]
  const materialsPage = parsePageParam(searchParams?.matPage)
  const materialsQuery = searchParams?.matQ?.trim() || undefined

  const [resourcesPage, archivedPage, assignments, mySubs, myPriorSubs] = await Promise.all([
    listResourcesPage(course.id, {
      page: materialsPage,
      pageSize: MATERIALS_PAGE_SIZE,
      status: 'active',
      search: materialsQuery,
    }),
    canManage
      ? listResourcesPage(course.id, { page: 1, pageSize: ARCHIVED_PAGE_SIZE, status: 'archived' })
      : Promise.resolve({ items: [], total: 0 }),
    listAssignments({ classId: course.id }),
    isStudentView ? listMyActiveSubmissions(me.id) : Promise.resolve([]),
    isStudentView ? listMySupersededSubmissions(me.id) : Promise.resolve([]),
  ])

  // An out-of-range ?matPage= (stale/shared/hand-edited URL) would otherwise show a
  // blank materials list with no empty-state and no pager. Clamp to the last real
  // page and refetch so the user lands on content with a working pager instead.
  const materialsTotalPages = totalPages(resourcesPage.total, MATERIALS_PAGE_SIZE)
  const effMaterialsPage = Math.min(materialsPage, materialsTotalPages)
  const materials =
    effMaterialsPage === materialsPage
      ? resourcesPage
      : await listResourcesPage(course.id, {
          page: effMaterialsPage,
          pageSize: MATERIALS_PAGE_SIZE,
          status: 'active',
          search: materialsQuery,
        })

  const subByAssignment = new Map(mySubs.map((s) => [s.assignment_id, s]))
  const historyByAssignment = new Map<string, Submission[]>()
  for (const prior of myPriorSubs) {
    const list = historyByAssignment.get(prior.assignment_id) ?? []
    list.push(prior)
    historyByAssignment.set(prior.assignment_id, list)
  }
  const visibleAssignments = assignments.filter(
    (a) =>
      canManage ||
      a.status === 'active' ||
      // Keep an archived assignment visible to a student who has work on it, so
      // their submission, mark and feedback don't vanish when a tutor archives it
      // (the classwork page renders it read-only - no resubmit/withdraw).
      subByAssignment.has(a.id) ||
      historyByAssignment.has(a.id),
  )

  const [commentsBySub, resourceComments] = await Promise.all([
    isStudentView
      ? listCommentsForEntities(
          'submission',
          mySubs.map((s) => s.id),
        )
      : Promise.resolve(new Map<string, Comment[]>()),
    listCommentsForEntities(
      'resource',
      materials.items.map((r) => r.id),
    ),
  ])

  const nowMs = Date.now()
  return {
    canManage,
    canManageContent,
    isStudent: isStudentView,
    isArchived,
    now: nowMs,
    classList,
    materialsPage: effMaterialsPage,
    materialsQuery,
    materialsTotal: materials.total,
    materialsTotalPages,
    assignmentViews: visibleAssignments.map((assignment) => {
      const submission = subByAssignment.get(assignment.id)
      return {
        assignment,
        submission,
        submissionComments: submission ? (commentsBySub.get(submission.id) ?? []) : [],
        submissionHistory: historyByAssignment.get(assignment.id) ?? [],
        deadlineClosed: assignment.enforce_deadline && Date.parse(assignment.due_date) < nowMs,
      }
    }),
    resourceViews: materials.items.map((resource) => ({
      resource,
      comments: resourceComments.get(resource.id) ?? [],
    })),
    archivedResources: archivedPage.items,
  }
}
