import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { classworkPageUrl, loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { ARCHIVED_ROW, Card, EmptyState, FILTER_CONTROL, FilterBar, FilterField, SectionLabel, cx } from '@/lib/ui'
import { deleteResourceAction, restoreResourceAction } from '../../../assignments/manage-actions'
import { CommentThread } from '../../../CommentThread'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { SubmitButton } from '../../../form'
import { LocalTime } from '../../../LocalTime'
import { UploadForm } from '../../../resources/UploadForm'
import { EditResource } from '../../../resources/EditResource'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>

export function MaterialsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  return (
    <section id="materials" className="scroll-mt-20 space-y-4">
      <SectionLabel>Materials</SectionLabel>
      {data.canManageContent && <UploadForm classes={data.classList} />}

      <FilterBar clearHref="?" showClear={Boolean(data.materialsQuery)} applyLabel="Search">
        <FilterField label="Search materials" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="matQ"
            defaultValue={data.materialsQuery ?? ''}
            placeholder="Title..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
      </FilterBar>

      <ul className="space-y-4">
        {data.resourceViews.map(({ resource, comments }) => (
          <Card as="li" key={resource.id} interactive className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{resource.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  <LocalTime iso={resource.created_at} mode="date" />
                </p>
              </div>
              <a
                href={`/api/resources/${resource.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-soft"
              >
                Open Link
              </a>
            </div>
            {data.canManageContent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <EditResource resource={resource} />
                <form action={deleteResourceAction}>
                  <input type="hidden" name="id" value={resource.id} />
                  <input type="hidden" name="class_id" value={courseId} />
                  <ConfirmSubmit
                    className="btn btn-sm btn-danger"
                    title="Remove this material?"
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
              entityId={resource.id}
              me={{ id: me.id, role: me.role }}
              initialComments={comments}
              placeholder="Ask a question or discuss..."
            />
          </Card>
        ))}
        {data.materialsTotal === 0 && (
          <EmptyState as="li">
            {data.materialsQuery ? `No materials match "${data.materialsQuery}".` : 'No materials shared yet.'}
          </EmptyState>
        )}
      </ul>

      {data.materialsTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {data.materialsPage} of {data.materialsTotalPages} - {data.materialsTotal} total
          </span>
          <div className="flex gap-2">
            {data.materialsPage > 1 && (
              <Link
                href={classworkPageUrl(data.materialsPage - 1, data.materialsQuery)}
                className="btn btn-sm btn-soft"
              >
                Previous
              </Link>
            )}
            {data.materialsPage < data.materialsTotalPages && (
              <Link
                href={classworkPageUrl(data.materialsPage + 1, data.materialsQuery)}
                className="btn btn-sm btn-soft"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      {data.canManage && data.archivedResources.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
            {data.archivedResources.length} archived material{data.archivedResources.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-2">
            {data.archivedResources.map((resource) => (
              <li key={resource.id} className={ARCHIVED_ROW}>
                <span className="truncate text-slate-500">{resource.title}</span>
                <form action={restoreResourceAction}>
                  <input type="hidden" name="id" value={resource.id} />
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
