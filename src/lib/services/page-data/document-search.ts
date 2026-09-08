import { clampPage, parsePageParam, totalPages } from '@/lib/pagination'
import { searchDocuments, type DocumentSearchResult } from '@/lib/services/resources'
import { isDocumentCategory, type DocumentCategory } from '@/lib/documents/categories'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'

/**
 * Page data for the global document search - documents across ALL
 * the caller's classes in one place. RLS in the service scopes the results; this
 * only parses the filters, pages, and shapes the view. Mirrors the per-class
 * library's filter model so the two behave identically.
 */

const PAGE_SIZE = 20

export type DocumentSearchFilters = {
  page: number
  q: string
  category: DocumentCategory | ''
  subject: string
  from: string
  to: string
  sort: 'latest' | 'oldest'
}

export type DocumentSearchParams = {
  page?: string
  q?: string
  cat?: string
  subj?: string
  from?: string
  to?: string
  sort?: string
}

/** One student's documents from THIS page of results, in the page's own order. */
export type DocumentStudentGroup = {
  /** The student's profile id, or '' for the unattached group. */
  key: string
  label: string
  results: DocumentSearchResult[]
}

export type DocumentSearchPageData = {
  filters: DocumentSearchFilters
  hasActiveFilters: boolean
  results: DocumentSearchResult[]
  /**
   * The same results, grouped under the student whose class owns each document.
   *
   * PAGE-LOCAL, and deliberately so - unlike /session-timings, which pages the student
   * roster precisely so a student's rows are never split. The difference is not an
   * oversight, it is what the two surfaces are:
   *
   *   - A document library answers "what has been added lately". Its order is recency, and
   *     re-ordering it by student to make groups whole would destroy the question it
   *     answers.
   *   - A document has no student column. It belongs to a CLASS, and the search runs
   *     through the caller's own session so RLS scopes it; there is no student-keyed query
   *     to page. Grouping resolves class -> student afterwards, for the page's classes only.
   *
   * So a student's documents CAN continue on the next page. The grouping is a reading aid
   * over a recency list, not a claim that a group is complete - which is why the page says
   * so rather than letting the reader assume otherwise.
   */
  groups: DocumentStudentGroup[]
  total: number
  totalPages: number
}

function isoOrUndefined(day: string, endOfDay = false): string | undefined {
  if (!day) return undefined
  const parsed = new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/** Builds a /documents URL carrying the current filters, overriding only `patch`
 *  (e.g. the next page). Defaults are omitted so a clean search has a clean URL. */
export function documentSearchUrl(filters: DocumentSearchFilters, patch: Partial<DocumentSearchFilters> = {}): string {
  const next = { ...filters, ...patch }
  const sp = new URLSearchParams()
  if (next.page > 1) sp.set('page', String(next.page))
  if (next.q) sp.set('q', next.q)
  if (next.category) sp.set('cat', next.category)
  if (next.subject) sp.set('subj', next.subject)
  if (next.from) sp.set('from', next.from)
  if (next.to) sp.set('to', next.to)
  if (next.sort === 'oldest') sp.set('sort', 'oldest')
  const query = sp.toString()
  return query ? `/documents?${query}` : '/documents'
}

export async function loadDocumentSearchPageData(searchParams?: DocumentSearchParams): Promise<DocumentSearchPageData> {
  const filters: DocumentSearchFilters = {
    page: parsePageParam(searchParams?.page),
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
  const read = (page: number) =>
    searchDocuments({
      page,
      pageSize: PAGE_SIZE,
      search: filters.q || undefined,
      category: filters.category || undefined,
      subject: filters.subject || undefined,
      dateFrom: isoOrUndefined(filters.from),
      dateTo: isoOrUndefined(filters.to, true),
      sort: filters.sort,
    })

  const first = await read(filters.page)
  // Fold a page past the end back onto the last real one. parsePageParam can only clamp
  // the LOWER bound - it has no idea how many rows exist - so a stale bookmark or a
  // narrowed filter otherwise leaves a blank list with no way back but editing the URL.
  const page = clampPage(filters.page, first.total, PAGE_SIZE)
  const { items, total } = page === filters.page ? first : await read(page)
  return {
    filters: { ...filters, page },
    hasActiveFilters,
    results: items,
    groups: await groupByStudent(items),
    total,
    totalPages: totalPages(total, PAGE_SIZE),
  }
}

/**
 * Group one page of results under the student whose class owns each document.
 *
 * Bounded by the PAGE: at most PAGE_SIZE documents, so at most that many classes and
 * students to resolve - two reads regardless of how large the library grows.
 *
 * Group order follows first appearance, so the recency of the underlying list survives:
 * the student with the newest document is first. Documents whose class has no active
 * student (a shared or archived class) collect in one trailing group rather than being
 * dropped - the page must show every result it counted.
 */
async function groupByStudent(results: DocumentSearchResult[]): Promise<DocumentStudentGroup[]> {
  if (results.length === 0) return []
  const classIds = [...new Set(results.map((r) => r.document.class_id))]
  const refs = await selectActiveEnrollmentRefsByClassIds(classIds)
  const studentByClass = new Map(refs.map((r) => [r.class_id, r.student_id]))
  const names = await getProfileNamesByIds([...new Set(refs.map((r) => r.student_id))])

  const order: string[] = []
  const byStudent = new Map<string, DocumentSearchResult[]>()
  for (const result of results) {
    const key = studentByClass.get(result.document.class_id) ?? ''
    const bucket = byStudent.get(key)
    if (bucket) bucket.push(result)
    else {
      byStudent.set(key, [result])
      order.push(key)
    }
  }
  return order.map((key) => ({
    key,
    label: key ? (names.get(key) ?? 'Unknown') : 'Not linked to a student',
    results: byStudent.get(key) ?? [],
  }))
}
