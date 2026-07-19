import Link from 'next/link'
import { requireClassAccess } from '../../access'
import { classworkPageUrl, loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { AssignmentForm } from '../../../assignments/AssignmentForm'
import { SubmitForm } from '../../../assignments/SubmitForm'
import { EditAssignment } from '../../../assignments/EditAssignment'
import {
  archiveAssignmentAction,
  deleteResourceAction,
  restoreResourceAction,
} from '../../../assignments/manage-actions'
import { UploadForm } from '../../../resources/UploadForm'
import { CommentThread } from '../../../CommentThread'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { SubmitButton } from '../../../form'
import { Card, EmptyState, Badge } from '../../../ui'
import { LocalTime } from '../../../LocalTime'

export default async function ClassworkPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { matPage?: string; matQ?: string }
}) {
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassworkPageData(me, course, searchParams)

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Assignments</h2>
        {data.canManage && <AssignmentForm classes={data.classList} />}

        <ul className="space-y-3">
          {data.assignmentViews.map(({ assignment, submission, submissionComments, submissionHistory }) => (
            <Card
              as="li"
              key={assignment.id}
              id={`assignment-${assignment.id}`}
              className="scroll-mt-24 p-4 transition hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-slate-900">{assignment.title}</h3>
                    {assignment.topic && <Badge tone="primary">{assignment.topic}</Badge>}
                    {assignment.max_marks != null && (
                      <span className="text-xs text-slate-400">/ {Number(assignment.max_marks)} marks</span>
                    )}
                  </div>
                  {assignment.description && <p className="mt-1 text-sm text-slate-600">{assignment.description}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>
                      due <LocalTime iso={assignment.due_date} />
                    </span>
                    {assignment.status === 'archived' && <span>- archived</span>}
                    {assignment.status === 'active' && !submission && Date.parse(assignment.due_date) < data.now && (
                      <Badge tone="danger">Overdue</Badge>
                    )}
                    {assignment.status === 'active' &&
                      !submission &&
                      Date.parse(assignment.due_date) >= data.now &&
                      Date.parse(assignment.due_date) - data.now < 172800000 && <Badge tone="warning">Due soon</Badge>}
                  </p>
                  {assignment.attachment_drive_link && assignment.attachment_drive_link !== '#' && (
                    <a
                      href={assignment.attachment_drive_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open brief in Drive
                    </a>
                  )}
                </div>
              </div>

              {data.canManage && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/assignments/${assignment.id}`} className="btn btn-sm btn-soft">
                    View submissions
                  </Link>
                  <EditAssignment assignment={assignment} />
                  <form action={archiveAssignmentAction}>
                    <input type="hidden" name="id" value={assignment.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={assignment.status === 'archived' ? 'active' : 'archived'}
                    />
                    <button className={`btn btn-sm ${assignment.status === 'archived' ? 'btn-success' : 'btn-warning'}`}>
                      {assignment.status === 'archived' ? 'Restore' : 'Archive'}
                    </button>
                  </form>
                </div>
              )}

              {data.isStudent && assignment.status === 'active' && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {submission ? (
                    <div className="text-sm">
                      <p>
                        Your submission:{' '}
                        <span
                          className={
                            submission.status === 'late'
                              ? 'font-semibold text-red-600'
                              : 'font-semibold text-emerald-700'
                          }
                        >
                          {submission.status === 'late' ? 'Submitted late' : 'On time'}
                        </span>{' '}
                        (<LocalTime iso={submission.submitted_at} />)
                        {submission.score == null && <> - resubmit below to replace.</>}
                      </p>
                      {submission.score != null && (
                        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                          <span className="font-semibold">
                            Marked: {Number(submission.score)}
                            {assignment.max_marks != null ? ` / ${Number(assignment.max_marks)}` : ''}
                          </span>
                          {submission.feedback && (
                            <span className="mt-0.5 block text-emerald-700">"{submission.feedback}"</span>
                          )}
                        </p>
                      )}
                      {submission.drive_link && (
                        <a
                          href={submission.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
                          title={submission.file_name ?? undefined}
                        >
                          <span className="truncate">{submission.file_name ?? 'Open your submission'}</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Not submitted yet.</p>
                  )}
                  {submissionHistory.length > 0 && (
                    <details className="mt-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-medium text-slate-500">
                        {submissionHistory.length} previous version{submissionHistory.length > 1 ? 's' : ''}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {submissionHistory.map((prior) => (
                          <li key={prior.id} className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">
                              <LocalTime iso={prior.submitted_at} /> - {prior.status}
                            </span>
                            {prior.drive_link && prior.drive_link !== '#' && (
                              <a
                                href={prior.drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-[12rem] truncate font-medium text-primary hover:underline"
                                title={prior.file_name ?? undefined}
                              >
                                {prior.file_name ?? 'Open'}
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {submission && submission.score != null ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Graded - ask your tutor to use the Reopen for resubmission button if you need to submit again.
                    </p>
                  ) : (
                    <SubmitForm assignmentId={assignment.id} studentEmail={me.email} />
                  )}
                  {submission && (
                    <CommentThread
                      entityType="submission"
                      entityId={submission.id}
                      me={{ id: me.id, role: me.role }}
                      initialComments={submissionComments}
                    />
                  )}
                </div>
              )}
            </Card>
          ))}
          {data.assignmentViews.length === 0 && <EmptyState as="li">No assignments yet.</EmptyState>}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Materials</h2>
        {data.canManage && <UploadForm classes={data.classList} />}

        <form className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-medium text-slate-500 sm:max-w-xs">
            Search materials
            <input
              type="search"
              name="matQ"
              defaultValue={data.materialsQuery ?? ''}
              placeholder="Title..."
              className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button className="btn btn-sm btn-soft">Search</button>
          {data.materialsQuery && (
            <a href="?" className="text-xs font-medium text-slate-400 hover:text-primary">
              Clear
            </a>
          )}
        </form>

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
                {data.canManage && (
                  <form action={deleteResourceAction}>
                    <input type="hidden" name="id" value={resource.id} />
                    <ConfirmSubmit
                      className="btn btn-sm btn-danger"
                      title="Remove this material?"
                      message="It's hidden from the class but kept on record."
                      confirmLabel="Remove"
                    >
                      Remove
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
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
                <Link href={classworkPageUrl(data.materialsPage - 1, data.materialsQuery)} className="btn btn-sm btn-soft">
                  Previous
                </Link>
              )}
              {data.materialsPage < data.materialsTotalPages && (
                <Link href={classworkPageUrl(data.materialsPage + 1, data.materialsQuery)} className="btn btn-sm btn-soft">
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
                <li
                  key={resource.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="truncate text-slate-500">{resource.title}</span>
                  <form action={restoreResourceAction}>
                    <input type="hidden" name="id" value={resource.id} />
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
    </div>
  )
}
