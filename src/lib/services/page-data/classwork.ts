import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAssignments, type Assignment } from '@/lib/services/assignments'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import {
  listResourcesPage,
  listVersionsForDocuments,
  type Document,
  type DocumentVersion,
} from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions, type Submission } from '@/lib/services/submissions'
import { DOCUMENT_CATEGORY_VALUES, isDocumentCategory, type DocumentCategory } from '@/lib/documents/categories'

// A class's document library is bounded (small academy), so we load the whole
// active set for the class in one query and group it into the four sections in
// memory. Filters/sort still run SQL-side. Global cross-class search + paging
// lives on the separate Documents page.
const CLASS_DOCS_CAP = 500
const ARCHIVED_PAGE_SIZE = 50

type ClassworkSearchParams = {
  q?: string
  cat?: string
  subj?: string
  from?: string
  to?: string
  sort?: string
  error?: string
}

type ClassworkAssignmentView = {
  assignment: Assignment
  submission: Submission | undefined
  submissionComments: Comment[]
  submissionHistory: Submission[]
  deadlineClosed: boolean
}

type ClassworkDocumentView = {
  document: Document
  comments: Comment[]
  versions: DocumentVersion[]
}

export type DocumentFilterState = {
  q: string
  category: DocumentCategory | ''
  subject: string
  from: string
  to: string
  sort: 'latest' | 'oldest'
}

type ClassworkPageData = {
  canManage: boolean
  canManageContent: boolean
  isStudent: boolean
  isArchived: boolean
  now: number
  classList: { id: string; name: string }[]
  filters: DocumentFilterState
  hasActiveFilters: boolean
  documentsByCategory: Record<DocumentCategory, ClassworkDocumentView[]>
  documentTotal: number
  assignmentViews: ClassworkAssignmentView[]
  archivedDocuments: Document[]
}

/** Builds a Classwork URL that preserves the current document filters, changing
 *  only the keys passed in `patch` (empty string clears a key). */
export function documentFilterUrl(current: DocumentFilterState, patch: Partial<DocumentFilterState>): string {
  const next = { ...current, ...patch }
  const sp = new URLSearchParams()
  if (next.q) sp.set('q', next.q)
  if (next.category) sp.set('cat', next.category)
  if (next.subject) sp.set('subj', next.subject)
  if (next.from) sp.set('from', next.from)
  if (next.to) sp.set('to', next.to)
  if (next.sort === 'oldest') sp.set('sort', 'oldest')
  const query = sp.toString()
  return query ? `?${query}` : '?'
}

function isoOrUndefined(day: string | undefined, endOfDay = false): string | undefined {
  if (!day) return undefined
  const parsed = new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
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
  const classList = [{ id: course.id, name: course.name }]

  const filters: DocumentFilterState = {
    q: searchParams?.q?.trim() ?? '',
    category: isDocumentCategory(searchParams?.cat ?? '') ? (searchParams!.cat as DocumentCategory) : '',
    subject: searchParams?.subj?.trim() ?? '',
    from: searchParams?.from ?? '',
    to: searchParams?.to ?? '',
    sort: searchParams?.sort === 'oldest' ? 'oldest' : 'latest',
  }
  const hasActiveFilters = Boolean(
    filters.q || filters.category || filters.subject || filters.from || filters.to || filters.sort === 'oldest',
  )

  const [docsPage, archivedPage, assignments, mySubs, myPriorSubs] = await Promise.all([
    listResourcesPage(course.id, {
      page: 1,
      pageSize: CLASS_DOCS_CAP,
      status: 'active',
      search: filters.q || undefined,
      category: filters.category || undefined,
      subject: filters.subject || undefined,
      dateFrom: isoOrUndefined(filters.from),
      dateTo: isoOrUndefined(filters.to, true),
      sort: filters.sort,
    }),
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
  const visibleAssignments = assignments.filter(
    (a) => canManage || a.status === 'active' || subByAssignment.has(a.id) || historyByAssignment.has(a.id),
  )

  const docIds = docsPage.items.map((d) => d.id)
  const [commentsBySub, docComments, versionsByDoc] = await Promise.all([
    isStudent
      ? listCommentsForEntities(
          'submission',
          mySubs.map((s) => s.id),
        )
      : Promise.resolve(new Map<string, Comment[]>()),
    listCommentsForEntities('resource', docIds),
    listVersionsForDocuments(docIds),
  ])

  const documentsByCategory = Object.fromEntries(
    DOCUMENT_CATEGORY_VALUES.map((c) => [c, [] as ClassworkDocumentView[]]),
  ) as Record<DocumentCategory, ClassworkDocumentView[]>
  for (const document of docsPage.items) {
    documentsByCategory[document.category].push({
      document,
      comments: docComments.get(document.id) ?? [],
      versions: versionsByDoc.get(document.id) ?? [],
    })
  }

  const nowMs = Date.now()
  return {
    canManage,
    canManageContent,
    isStudent,
    isArchived,
    now: nowMs,
    classList,
    filters,
    hasActiveFilters,
    documentsByCategory,
    documentTotal: docsPage.items.length,
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
    archivedDocuments: archivedPage.items,
  }
}
