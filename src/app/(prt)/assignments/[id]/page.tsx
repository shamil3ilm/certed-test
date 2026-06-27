import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment } from '@/lib/repos/assignments'
import { listSubmissionsForAssignment } from '@/lib/repos/submissions'
import { listCommentsForSubmission } from '@/lib/repos/comments'
import { getProfileNamesByIds } from '@/lib/repos/users'
import { CommentThread } from '../CommentThread'
import { PageHeader } from '../../ui'

export default async function AssignmentDetail({ params }: { params: { id: string } }) {
  const me = await requireRole(['admin', 'teacher'])
  const assignment = await getAssignment(params.id)
  if (!assignment) notFound()

  const submissions = await listSubmissionsForAssignment(params.id)
  const names = await getProfileNamesByIds(submissions.map((s) => s.student_id))

  // Load all comments for all submissions in parallel
  const commentsPerSub = await Promise.all(
    submissions.map((s) => listCommentsForSubmission(s.id)),
  )

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={assignment.title}
        description={`Due ${new Date(assignment.due_date).toLocaleString()} · ${submissions.length} submission(s)`}
      />

      <div className="mt-6 space-y-4">
        {submissions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No submissions yet.
          </div>
        )}

        {submissions.map((s, i) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
            {/* Submission header row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">
                  {(names.get(s.student_id) ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-slate-900">{names.get(s.student_id) ?? s.student_id}</p>
                  <p className="text-xs text-slate-400">
                    Submitted {new Date(s.submitted_at).toLocaleString()}
                    {' · '}
                    <span className={s.status === 'late' ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {s.status}
                    </span>
                  </p>
                </div>
              </div>
              {s.drive_link && s.drive_link !== '#' ? (
                <a
                  href={s.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-soft"
                >
                  Open in Drive ↗
                </a>
              ) : (
                <a href={`/api/submissions/${s.id}/download`} className="btn btn-sm btn-soft">
                  Download
                </a>
              )}
            </div>

            {/* Comment thread */}
            <CommentThread
              submissionId={s.id}
              assignmentId={assignment.id}
              currentUserId={me.id}
              currentUserRole={me.role}
              initialComments={commentsPerSub[i] ?? []}
            />
          </div>
        ))}
      </div>
    </main>
  )
}
