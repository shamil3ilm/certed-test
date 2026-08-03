import { parsePageParam, totalPages } from '@/lib/pagination'
import { searchDocuments, type DocumentSearchResult } from '@/lib/services/resources'
import { isDocumentCategory, type DocumentCategory } from '@/lib/documents/categories'

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

export type DocumentSearchPageData = {
  filters: DocumentSearchFilters
  hasActiveFilters: boolean
  results: DocumentSearchResult[]
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
  const { items, total } = await searchDocuments({
    page: filters.page,
    pageSize: PAGE_SIZE,
    search: filters.q || undefined,
    category: filters.category || undefined,
    subject: filters.subject || undefined,
    dateFrom: isoOrUndefined(filters.from),
    dateTo: isoOrUndefined(filters.to, true),
    sort: filters.sort,
  })
  return { filters, hasActiveFilters, results: items, total, totalPages: totalPages(total, PAGE_SIZE) }
}
