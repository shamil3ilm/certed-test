import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import {
  documentSearchUrl,
  loadDocumentSearchPageData,
  type DocumentSearchParams,
} from '@/lib/services/page-data/document-search'
import { DOCUMENT_CATEGORIES, documentCategoryLabel } from '@/lib/documents/categories'
import { Badge, Card, EmptyState, FILTER_CONTROL, FilterBar, FilterField, PageHeader, cx } from '@/lib/ui'
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
        description="Search question papers, practice sheets and resources across all your classes."
      />

      <FilterBar className="mt-2" clearHref="/documents" showClear={hasActiveFilters}>
        <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Title, description, subject..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
        <FilterField label="Category">
          <select name="cat" defaultValue={filters.category} className={FILTER_CONTROL}>
            <option value="">All categories</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Subject">
          <input
            type="search"
            name="subj"
            defaultValue={filters.subject}
            placeholder="e.g. Maths"
            className={cx(FILTER_CONTROL, 'sm:w-40')}
          />
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={filters.from} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={filters.to} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="Sort">
          <select name="sort" defaultValue={filters.sort} className={FILTER_CONTROL}>
            <option value="latest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </FilterField>
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
                    <LocalTime iso={document.created_at} mode="date" /> · {document.download_count} download
                    {document.download_count === 1 ? '' : 's'}
                  </p>
                </div>
                <a
                  href={`/api/resources/${document.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-soft shrink-0"
                >
                  Open
                </a>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {filters.page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            {filters.page > 1 && (
              <Link href={documentSearchUrl(filters, { page: filters.page - 1 })} className="btn btn-sm btn-soft">
                Previous
              </Link>
            )}
            {filters.page < totalPages && (
              <Link href={documentSearchUrl(filters, { page: filters.page + 1 })} className="btn btn-sm btn-soft">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
