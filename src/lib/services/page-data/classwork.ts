import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAssignments, type Assignment } from '@/lib/services/assignments'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listResourcesPage, type Resource } from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions, type Submission } from '@/lib/services/submissions'

const MATERIALS_PAGE_SIZE = 10
const ARCHIVED_PAGE_SIZE = 20

export type ClassworkSearchParams = { matPage?: string; matQ?: string }

export type ClassworkAssignmentView = {
  assignment: Assignment
  submission: Submission | undefined
  submissionComments: Comment[]
  /** The student's own prior (replaced) versions for this assignment, newest first. */
  submissionHistory: Submission[]
}

export type ClassworkResourceView = {
  resource: Resource
  comments: Comment[]
}

export type ClassworkPageData = {
  canManage: boolean
  isStudent: boolean
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
  me: Pick<Profile, 'id' | 'role'>,
  course: { id: string; name: string },
  searchParams?: ClassworkSearchParams,
): Promise<ClassworkPageData> {
  const { isManager, isStudent } = await loadPersonaFlags(me.id)
  const canManage = isManager
  const classList = [{ id: course.id, name: course.name }]
  const materialsPage = Math.max(1, Number(searchParams?.matPage ?? '1') || 1)
  const materialsQuery = searchParams?.matQ?.trim() || undefined

  const [resourcesPage, archivedPage, assignments, mySubs, myPriorSubs] = await Promise.all([
    listResourcesPage(course.id, { page: materialsPage, pageSize: MATERIALS_PAGE_SIZE, status: 'active', search: materialsQuery }),
    canManage
      ? listResourcesPage(course.id, { page: 1, pageSize: ARCHIVED_PAGE_SIZE, status: 'archived' })
      : Promise.resolve({ items: [], total: 0 }),
    listAssignments({ classId: course.id }),
    isStudent ? listMyActiveSubmissions(me.id) : Promise.resolve([]),
    isStudent ? listMySupersededSubmissions(me.id) : Promise.resolve([]),
  ])

  const subByAssignment = new Map(mySubs.map((s) => [s.assignment_id, s]))
  const historyByAssignment = new Map<string, Submission[]>()
  for (const prior of myPriorSubs) {
    const list = historyByAssignment.get(prior.assignment_id) ?? []
    list.push(prior)
    historyByAssignment.set(prior.assignment_id, list)
  }
  const visibleAssignments = assignments.filter((a) => canManage || a.status === 'active')

  const [commentsBySub, resourceComments] = await Promise.all([
    isStudent
      ? listCommentsForEntities('submission', mySubs.map((s) => s.id))
      : Promise.resolve(new Map<string, Comment[]>()),
    listCommentsForEntities('resource', resourcesPage.items.map((r) => r.id)),
  ])

  return {
    canManage,
    isStudent,
    now: Date.now(),
    classList,
    materialsPage,
    materialsQuery,
    materialsTotal: resourcesPage.total,
    materialsTotalPages: Math.max(1, Math.ceil(resourcesPage.total / MATERIALS_PAGE_SIZE)),
    assignmentViews: visibleAssignments.map((assignment) => {
      const submission = subByAssignment.get(assignment.id)
      return {
        assignment,
        submission,
        submissionComments: submission ? (commentsBySub.get(submission.id) ?? []) : [],
        submissionHistory: historyByAssignment.get(assignment.id) ?? [],
      }
    }),
    resourceViews: resourcesPage.items.map((resource) => ({
      resource,
      comments: resourceComments.get(resource.id) ?? [],
    })),
    archivedResources: archivedPage.items,
  }
}
