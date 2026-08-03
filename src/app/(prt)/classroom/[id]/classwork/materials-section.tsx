import type { Profile } from '@/lib/auth/profile'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import {
  ARCHIVED_ROW,
  Badge,
  Card,
  EmptyState,
  FILTER_CONTROL,
  FilterBar,
  FilterField,
  SectionLabel,
  cx,
} from '@/lib/ui'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_VALUES,
  documentCategoryLabel,
  type DocumentCategory,
} from '@/lib/documents/categories'
import { deleteResourceAction, restoreResourceAction } from '../../../assignments/manage-actions'
import { CommentThread } from '../../../CommentThread'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { SubmitButton } from '../../../form'
import { LocalTime } from '../../../LocalTime'
import { UploadForm } from '../../../resources/UploadForm'
import { EditResource } from '../../../resources/EditResource'
import { VersionHistory } from '../../../resources/VersionHistory'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>
type DocumentView = ClassworkPageData['documentsByCategory'][DocumentCategory][number]

/** Inline Drive/Docs preview URL, or null when the link can't be embedded. */
function drivePreviewUrl(link: string | null): string | null {
  if (!link) return null
  const file = link.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)
  if (file) return `https://drive.google.com/file/d/${file[1]}/preview`
  const doc = link.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/)
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`
  return null
}

function DocumentCard({
  view,
  data,
  me,
  courseId,
}: {
  view: DocumentView
  data: ClassworkPageData
  me: Profile
  courseId: string
}) {
  const doc = view.document
  const preview = drivePreviewUrl(doc.drive_link)
  return (
    <Card as="li" className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{doc.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {doc.subject && <Badge tone="primary">{doc.subject}</Badge>}
            {doc.file_type && <Badge>{doc.file_type}</Badge>}
            {doc.visibility === 'staff' && data.canManage && <Badge tone="warning">Staff only</Badge>}
          </div>
          {doc.description && <p className="mt-1.5 text-sm text-slate-600">{doc.description}</p>}
          <p className="mt-1.5 text-xs text-slate-400">
            <LocalTime iso={doc.created_at} mode="date" /> · {doc.download_count} download
            {doc.download_count === 1 ? '' : 's'}
          </p>
        </div>
        <a
          href={`/api/resources/${doc.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-soft shrink-0"
        >
          Open
        </a>
      </div>

      {preview && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
            Preview
          </summary>
          <iframe
            src={preview}
            title={`Preview of ${doc.title}`}
            className="mt-2 h-96 w-full rounded-lg border border-slate-200"
            loading="lazy"
          />
        </details>
      )}

      <VersionHistory
        resourceId={doc.id}
        classId={courseId}
        versions={view.versions}
        canManage={data.canManageContent}
      />

      {data.canManageContent && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EditResource resource={doc} />
          <form action={deleteResourceAction}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="class_id" value={courseId} />
            <ConfirmSubmit
              className="btn btn-sm btn-danger"
              title="Remove this document?"
              message="It's hidden from the class but kept on record."
              confirmLabel="Remove"
            >
              Remove
            </ConfirmSubmit>
          </form>
        </div>
      )}

      <CommentThread
        entityType="resource"
        entityId={doc.id}
        me={{ id: me.id, role: me.role }}
        initialComments={view.comments}
        placeholder="Ask a question or discuss..."
      />
    </Card>
  )
}

export function MaterialsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  const { filters } = data
  // When a category filter is active, show only that section; otherwise all four.
  const visibleCategories: DocumentCategory[] = filters.category ? [filters.category] : [...DOCUMENT_CATEGORY_VALUES]

  return (
    <section id="materials" className="scroll-mt-20 space-y-4">
      <SectionLabel>Documents</SectionLabel>
      {data.canManageContent && <UploadForm classes={data.classList} />}

      <FilterBar clearHref="?" showClear={data.hasActiveFilters} applyLabel="Apply">
        <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Title, subject, description..."
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
          <input name="subj" defaultValue={filters.subject} placeholder="e.g. Maths" className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={filters.from} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={filters.to} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="Sort">
          <select name="sort" defaultValue={filters.sort} className={FILTER_CONTROL}>
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </FilterField>
      </FilterBar>

      {data.documentTotal === 0 ? (
        <EmptyState>
          {data.hasActiveFilters ? 'No documents match these filters.' : 'No documents uploaded yet.'}
        </EmptyState>
      ) : (
        visibleCategories.map((category) => {
          const views = data.documentsByCategory[category]
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">
                {documentCategoryLabel(category)}{' '}
                <span className="text-xs font-normal text-slate-400">({views.length})</span>
              </h3>
              {views.length === 0 ? (
                <p className="text-sm text-slate-400">No documents in this category.</p>
              ) : (
                <ul className="space-y-3">
                  {views.map((view) => (
                    <DocumentCard key={view.document.id} view={view} data={data} me={me} courseId={courseId} />
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )}

      {data.canManage && data.archivedDocuments.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
            {data.archivedDocuments.length} archived document{data.archivedDocuments.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-2">
            {data.archivedDocuments.map((doc) => (
              <li key={doc.id} className={ARCHIVED_ROW}>
                <span className="truncate text-slate-500">
                  {doc.title} <span className="text-slate-400">({documentCategoryLabel(doc.category)})</span>
                </span>
                <form action={restoreResourceAction}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="class_id" value={courseId} />
                  <SubmitButton className="btn-sm btn-success" pendingLabel="...">
                    Restore
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
