import { requireCapability } from '@/lib/auth/require-role'
import { DOCUMENT_CATEGORIES, documentCategoryLabel } from '@/lib/documents/categories'
import {
  documentSearchUrl,
  loadDocumentSearchPageData,
  type DocumentSearchParams,
} from '@/lib/services/page-data/document-search'
import {
  Badge,
  Card,
  DateFilterField,
  EmptyState,
  ExternalActionLink,
  FilterBar,
  PageHeader,
  PaginationBar,
  SearchFilterField,
  SelectFilterField,
} from '@/lib/ui'
import { LocalTime } from '../LocalTime'

/**
 * Global document search: every document across the classes the
 * caller can access, in one searchable place. RLS scopes the results per persona
 * (staff see staff-only docs in their classes; students see class-visible ones),
 * so the same page serves everyone. Downloads go through the audited route.
 */
export default async function DocumentsPage(props: { searchParams: Promise<DocumentSearchParams> }) {
  const searchParams = await props.searchParams
  await requireCapability('viewClasses')
  const { filters, hasActiveFilters, results, total, totalPages } = await loadDocumentSearchPageData(searchParams)

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Documents"
        description="Search question papers, practice sheets and other materials across all your classes."
      />

      <FilterBar className="mt-2" clearHref="/documents" showClear={hasActiveFilters}>
        <SearchFilterField name="q" defaultValue={filters.q} placeholder="Title, description, subject..." />
        <SelectFilterField label="Category" name="cat" defaultValue={filters.category}>
          <option value="">All categories</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </SelectFilterField>
        <SearchFilterField
          label="Subject"
          name="subj"
          defaultValue={filters.subject}
          placeholder="e.g. Maths"
          className="sm:w-40"
          inputClassName="sm:w-40"
        />
        <DateFilterField label="From" name="from" defaultValue={filters.from} />
        <DateFilterField label="To" name="to" defaultValue={filters.to} />
        <SelectFilterField label="Sort" name="sort" defaultValue={filters.sort}>
          <option value="latest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </SelectFilterField>
      </FilterBar>

      {results.length === 0 ? (
        <EmptyState className="mt-4">
          {hasActiveFilters ? 'No documents match these filters.' : 'No documents available yet.'}
        </EmptyState>
      ) : (
        <ul className="mt-4 space-y-2">
          {results.map(({ document, className }) => (
            <li key={document.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{document.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge tone="primary">{className}</Badge>
                    <Badge>{documentCategoryLabel(document.category)}</Badge>
                    {document.subject && <Badge>{document.subject}</Badge>}
                    {document.file_type && <Badge>{document.file_type}</Badge>}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    <LocalTime iso={document.created_at} mode="date" /> - {document.download_count} download
                    {document.download_count === 1 ? '' : 's'}
                  </p>
                </div>
                <ExternalActionLink href={`/api/resources/${document.id}/download`} className="shrink-0">
                  Open
                </ExternalActionLink>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <PaginationBar
        page={filters.page}
        totalPages={totalPages}
        total={total}
        previousHref={filters.page > 1 ? documentSearchUrl(filters, { page: filters.page - 1 }) : undefined}
        nextHref={filters.page < totalPages ? documentSearchUrl(filters, { page: filters.page + 1 }) : undefined}
        separator="-"
      />
    </main>
  )
}
