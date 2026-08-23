import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadAssignmentDetailPageData } from '@/lib/services/page-data/assignment-detail-page'
import { CommentThread } from '../../CommentThread'
import { LocalTime } from '../../LocalTime'
import { Avatar, Badge, BackLink, Card, EmptyState, ExternalActionLink, PageHeader, statusLabel } from '@/lib/ui'
import { GradeForm } from '../GradeForm'
import { ResultGradeForm } from '../ResultGradeForm'

export default async function AssignmentDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await requireCapability('viewGrading')
  const data = await loadAssignmentDetailPageData(me, params.id)
  if (!data) notFound()

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <BackLink href={`/classroom/${data.assignment.class_id}/classwork`}>
        Back to {data.course?.name ?? 'class'} - Classwork
      </BackLink>
      <PageHeader
        title={data.assignment.title}
        description={
          <>
            {data.expectsSubmission ? 'Due ' : 'On '}
            <LocalTime iso={data.assignment.due_date} />
            {' - '}
            {data.expectsSubmission ? `${data.submissions.length} submission(s)` : `${data.roster.length} student(s)`}
            {data.assignment.max_marks != null && <> - out of {Number(data.assignment.max_marks)}</>}
          </>
        }
      />

      {!data.expectsSubmission && (
        <div className="mt-6 space-y-4">
          {data.roster.length === 0 && <EmptyState>No student enrolled yet.</EmptyState>}
          {data.roster.map((entry) => (
            <Card key={entry.studentId} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={entry.studentName} role="student" />
                <div>
                  <p className="font-medium text-slate-900">{entry.studentName}</p>
                  <p className="text-xs text-slate-400">
                    {entry.submission?.score != null
                      ? `Marked${data.assignment.max_marks != null ? ` - ${Number(entry.submission.score)}/${Number(data.assignment.max_marks)}` : ''}`
                      : 'Not yet marked'}
                  </p>
                </div>
              </div>
              <ResultGradeForm
                assignmentId={data.assignment.id}
                studentId={entry.studentId}
                maxMarks={data.assignment.max_marks}
                score={entry.submission?.score ?? null}
                feedback={entry.submission?.feedback ?? null}
              />
            </Card>
          ))}
        </div>
      )}

      <div className={data.expectsSubmission ? 'mt-6 space-y-4' : 'hidden'}>
        {data.submissions.length === 0 && <EmptyState>No submissions yet.</EmptyState>}

        {data.submissions.map((submission) => (
          <Card key={submission.id} id={`sub-${submission.id}`} className="scroll-mt-24 p-4 transition hover:shadow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={data.names.get(submission.student_id) ?? '?'} role="student" />
                <div>
                  <p className="font-medium text-slate-900">
                    {data.names.get(submission.student_id) ?? submission.student_id}
                  </p>
                  <p className="text-xs text-slate-400">
                    Submitted <LocalTime iso={submission.submitted_at} />
                    {' - '}
                    <Badge tone={submission.status === 'late' ? 'danger' : 'success'}>
                      {statusLabel(submission.status)}
                    </Badge>
                  </p>
                </div>
              </div>
              {submission.drive_link && submission.drive_link !== '#' && (
                <ExternalActionLink
                  href={submission.drive_link}
                  className="inline-flex max-w-[14rem] items-center gap-1"
                  title={submission.file_name ?? undefined}
                >
                  <span className="truncate">{submission.file_name ?? 'Open in Drive'}</span>
                  <span aria-hidden>{'->'}</span>
                </ExternalActionLink>
              )}
            </div>

            <GradeForm
              submissionId={submission.id}
              assignmentId={data.assignment.id}
              maxMarks={data.assignment.max_marks}
              score={submission.score}
              feedback={submission.feedback}
            />

            {(data.historyByStudent.get(submission.student_id)?.length ?? 0) > 0 && (
              <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-slate-500">
                  {data.historyByStudent.get(submission.student_id)!.length} previous version
                  {data.historyByStudent.get(submission.student_id)!.length > 1 ? 's' : ''} (replaced)
                </summary>
                <ul className="mt-2 space-y-1">
                  {data.historyByStudent.get(submission.student_id)!.map((prior) => (
                    <li key={prior.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">
                        Submitted <LocalTime iso={prior.submitted_at} /> - {statusLabel(prior.status)}
                      </span>
                      {prior.drive_link && prior.drive_link !== '#' && (
                        <a
                          href={prior.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-[12rem] truncate font-medium text-primary hover:underline"
                          title={prior.file_name ?? undefined}
                        >
                          {prior.file_name ?? 'Open'} {'->'}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <CommentThread
              entityType="submission"
              entityId={submission.id}
              me={{ id: me.id, role: me.role }}
              initialComments={data.commentsBySub.get(submission.id) ?? []}
            />
          </Card>
        ))}
      </div>
    </main>
  )
}
