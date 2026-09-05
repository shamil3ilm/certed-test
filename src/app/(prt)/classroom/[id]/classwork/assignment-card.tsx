import Link from 'next/link'
import type { Profile } from '@/lib/auth/profile'
import { formatMark } from '@/lib/grades'
import { loadClassworkPageData } from '@/lib/services/page-data/classwork'
import { Badge, Card, statusLabel } from '@/lib/ui'
import { EditAssignment } from '../../../assignments/EditAssignment'
import { classworkTypeLabel } from '../../../assignments/classwork-types'
import { SubmitForm } from '../../../assignments/SubmitForm'
import { WithdrawButton } from '../../../assignments/WithdrawButton'
import { archiveAssignmentAction } from '../../../assignments/manage-actions'
import { CommentThread } from '../../../CommentThread'
import { LocalTime } from '../../../LocalTime'
import { safeExternalHref } from '@/lib/validation/url'
import { listAttachmentsForOwner } from '@/lib/services/attachments/read'
import { AssignmentAttachments } from './AssignmentAttachments'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>
type AssignmentView = ClassworkPageData['assignmentViews'][number]

export async function AssignmentCard({
  view,
  data,
  me,
  courseId,
}: {
  view: AssignmentView
  data: ClassworkPageData
  me: Profile
  courseId: string
}) {
  const { assignment, submission, submissionComments, submissionHistory, deadlineClosed } = view
  // The custodial files already on this student's submission, so the submit form
  // shows them on load (newly-uploaded ones append client-side).
  const submissionAttachments = submission
    ? await listAttachmentsForOwner({ kind: 'submission', id: submission.id })
    : []
  // The custodial PDF brief(s) on this assignment. RLS-scoped: a viewer who cannot
  // read the assignment gets an empty list.
  const assignmentAttachments = await listAttachmentsForOwner({ kind: 'assignment', id: assignment.id })

  return (
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
            {assignment.type !== 'assignment' && <Badge tone="success">{classworkTypeLabel(assignment.type)}</Badge>}
            {assignment.topic && <Badge tone="primary">{assignment.topic}</Badge>}
            {assignment.max_marks != null ? (
              <span className="text-xs text-slate-600">/ {Number(assignment.max_marks)} marks</span>
            ) : (
              data.canManageContent && <Badge tone="warning">No max marks - Edit to set</Badge>
            )}
          </div>
          {assignment.description && <p className="mt-1 text-sm text-slate-600">{assignment.description}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              due <LocalTime iso={assignment.due_date} />
            </span>
            {assignment.status === 'archived' && <span>- archived</span>}
            {assignment.status === 'active' &&
              assignment.enforce_deadline &&
              (deadlineClosed ? <Badge tone="danger">Closed</Badge> : <span>- closes at deadline</span>)}
            {assignment.status === 'active' && !submission && Date.parse(assignment.due_date) < data.now && (
              <Badge tone="danger">Overdue</Badge>
            )}
            {assignment.status === 'active' &&
              !submission &&
              Date.parse(assignment.due_date) >= data.now &&
              Date.parse(assignment.due_date) - data.now < 172800000 && <Badge tone="warning">Due soon</Badge>}
          </p>
          {safeExternalHref(assignment.attachment_drive_link) && (
            <a
              href={safeExternalHref(assignment.attachment_drive_link)!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open brief in Drive
            </a>
          )}
        </div>
      </div>

      {data.canManageContent && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/assignments/${assignment.id}`} className="btn btn-sm btn-soft">
            View submissions
          </Link>
          <EditAssignment assignment={assignment} />
          <form action={archiveAssignmentAction}>
            <input type="hidden" name="id" value={assignment.id} />
            <input type="hidden" name="class_id" value={courseId} />
            <input type="hidden" name="status" value={assignment.status === 'archived' ? 'active' : 'archived'} />
            <button
              type="submit"
              className={`btn btn-sm ${assignment.status === 'archived' ? 'btn-success' : 'btn-warning'}`}
            >
              {assignment.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </form>
        </div>
      )}

      <AssignmentAttachments
        assignmentId={assignment.id}
        initialAttachments={assignmentAttachments}
        canManage={data.canManageContent}
      />

      {data.isStudent && (assignment.status === 'active' || submission || submissionHistory.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {submission ? (
            <div className="text-sm">
              <p>
                Your submission:{' '}
                <Badge tone={submission.status === 'late' ? 'danger' : 'success'}>
                  {submission.status === 'late' ? 'Submitted late' : 'On time'}
                </Badge>{' '}
                (<LocalTime iso={submission.submitted_at} />)
                {submission.score == null && assignment.status === 'active' && !deadlineClosed && (
                  <> - resubmit below to replace, or withdraw it.</>
                )}
              </p>
              {submission.score == null && assignment.status === 'active' && !deadlineClosed && (
                <div className="mt-1">
                  <WithdrawButton submissionId={submission.id} />
                </div>
              )}
              {submission.score != null && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                  <span className="font-semibold">
                    Marked:{' '}
                    {formatMark(
                      Number(submission.score),
                      assignment.max_marks != null ? Number(assignment.max_marks) : null,
                    )}
                  </span>
                  {submission.feedback && (
                    <span className="mt-0.5 block text-emerald-700">&quot;{submission.feedback}&quot;</span>
                  )}
                </p>
              )}
              {safeExternalHref(submission.drive_link) && (
                <a
                  href={safeExternalHref(submission.drive_link)!}
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
            <p className="text-sm text-slate-600">Not submitted yet.</p>
          )}

          {submissionHistory.length > 0 && (
            <details className="mt-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-slate-600">
                {submissionHistory.length} earlier submission{submissionHistory.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1">
                {submissionHistory.map((prior) => (
                  <li key={prior.id} className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">
                      <LocalTime iso={prior.submitted_at} /> - {statusLabel(prior.status)}
                    </span>
                    {safeExternalHref(prior.drive_link) && (
                      <a
                        href={safeExternalHref(prior.drive_link)!}
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

          {assignment.status !== 'active' ? (
            <p className="mt-2 text-xs text-slate-600">
              This assignment has been archived by your tutor - your submission and mark above are read-only.
            </p>
          ) : submission && submission.score != null ? (
            <p className="mt-2 text-xs text-slate-600">
              Graded. Need to submit again? Ask your tutor in the comments below - only they can reopen it for
              resubmission.
            </p>
          ) : deadlineClosed ? (
            <p className="mt-2 text-xs text-slate-600">
              Submissions are closed - the deadline for this assignment has passed.
            </p>
          ) : (
            <SubmitForm
              assignmentId={assignment.id}
              submissionId={submission?.id ?? null}
              initialAttachments={submissionAttachments}
            />
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
  )
}
