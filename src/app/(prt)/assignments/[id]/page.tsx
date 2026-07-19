import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadAssignmentDetailPageData } from '@/lib/services/page-data/assignment-detail-page'
import { CommentThread } from '../../CommentThread'
import { LocalTime } from '../../LocalTime'
import { Avatar, Card, EmptyState, PageHeader } from '../../ui'
import { GradeForm } from '../GradeForm'

export default async function AssignmentDetail({ params }: { params: { id: string } }) {
  const me = await requireCapability('viewGrading')
  const data = await loadAssignmentDetailPageData(me, params.id)
  if (!data) notFound()

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        href={`/classroom/${data.assignment.class_id}/classwork`}
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        Back to {data.course?.name ?? 'class'} - Classwork
      </Link>
      <PageHeader
        title={data.assignment.title}
        description={
          <>
            Due <LocalTime iso={data.assignment.due_date} /> - {data.submissions.length} submission(s)
            {data.assignment.max_marks != null && <> - out of {Number(data.assignment.max_marks)}</>}
          </>
        }
      />

      <div className="mt-6 space-y-4">
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
                    <span className={submission.status === 'late' ? 'font-semibold text-red-600' : 'font-semibold text-emerald-700'}>
                      {submission.status}
                    </span>
                  </p>
                </div>
              </div>
              {submission.drive_link && submission.drive_link !== '#' && (
                <a
                  href={submission.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-soft inline-flex max-w-[14rem] items-center gap-1"
                  title={submission.file_name ?? undefined}
                >
                  <span className="truncate">{submission.file_name ?? 'Open in Drive'}</span>
                  <span aria-hidden>{'->'}</span>
                </a>
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
                        Submitted <LocalTime iso={prior.submitted_at} /> - {prior.status}
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
