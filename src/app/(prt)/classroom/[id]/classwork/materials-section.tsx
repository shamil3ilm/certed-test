import type { Profile } from '@/lib/auth/profile'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_VALUES,
  documentCategoryLabel,
  type DocumentCategory,
} from '@/lib/documents/categories'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import {
  ArchivedList,
  Badge,
  Card,
  DateFilterField,
  EmptyState,
  ExternalActionLink,
  FilterBar,
  SearchFilterField,
  SectionLabel,
  SelectFilterField,
} from '@/lib/ui'
import { deleteResourceAction, restoreResourceAction } from '../../../assignments/manage-actions'
import { CommentThread } from '../../../CommentThread'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { SubmitButton } from '../../../form'
import { LocalTime } from '../../../LocalTime'
import { EditResource } from '../../../resources/EditResource'
import { UploadForm } from '../../../resources/UploadForm'
import { VersionHistory } from '../../../resources/VersionHistory'
import { drivePreviewUrl } from '@/lib/documents/preview'
import { DrivePreview } from '../DrivePreview'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>
type DocumentView = ClassworkPageData['documentsByCategory'][DocumentCategory][number]

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
            <LocalTime iso={doc.created_at} mode="date" /> - {doc.download_count} download
            {doc.download_count === 1 ? '' : 's'}
          </p>
        </div>
        <ExternalActionLink href={`/api/resources/${doc.id}/download`} className="shrink-0">
          Open
        </ExternalActionLink>
      </div>

      {preview && (
        <DrivePreview
          src={preview}
          title={`Preview of ${doc.title}`}
          summary="Preview"
          className="mt-3"
          summaryClassName="cursor-pointer text-xs font-medium text-primary transition hover:underline"
          iframeClassName="mt-2 h-96 w-full rounded-lg border border-slate-200"
        />
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
        <SearchFilterField name="q" defaultValue={filters.q} placeholder="Title, subject, description..." />
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
          <option value="latest">Latest first</option>
          <option value="oldest">Oldest first</option>
        </SelectFilterField>
      </FilterBar>

      {data.documentTotal === 0 ? (
        <EmptyState>
          {data.hasActiveFilters ? 'No materials match these filters.' : 'No materials uploaded yet.'}
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
                <p className="text-sm text-slate-400">No materials in this category.</p>
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

      {data.canManage && (
        <ArchivedList
          count={data.archivedDocuments.length}
          singularLabel="archived document"
          items={data.archivedDocuments.map((doc) => ({
            key: doc.id,
            label: (
              <>
                {doc.title} <span className="text-slate-400">({documentCategoryLabel(doc.category)})</span>
              </>
            ),
            action: (
              <form action={restoreResourceAction}>
                <input type="hidden" name="id" value={doc.id} />
                <input type="hidden" name="class_id" value={courseId} />
                <SubmitButton className="btn-sm btn-success" pendingLabel="...">
                  Restore
                </SubmitButton>
              </form>
            ),
          }))}
        />
      )}
    </section>
  )
}
