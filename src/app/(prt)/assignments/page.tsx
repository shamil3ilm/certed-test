import Link from 'next/link'
import { requireRole } from '@/lib/auth/requireRole'
import { listAssignments } from '@/lib/repos/assignments'
import { listCourses } from '@/lib/repos/courses'
import { listMyActiveSubmissions } from '@/lib/repos/submissions'
import { listCommentsForSubmission } from '@/lib/repos/comments'
import { AssignmentForm } from './AssignmentForm'
import { SubmitForm } from './SubmitForm'
import { CommentThread } from './CommentThread'
import { PageHeader } from '../ui'

export default async function AssignmentsPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const [assignments, courses] = await Promise.all([listAssignments(), listCourses()])
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const canManage = me.role === 'admin' || me.role === 'teacher'
  const mySubs = me.role === 'student' ? await listMyActiveSubmissions(me.id) : []
  const subByAssignment = new Map(mySubs.map((s) => [s.assignment_id, s]))

  // For students: load comments for their submitted assignments
  const commentsBySub = new Map<string, Awaited<ReturnType<typeof listCommentsForSubmission>>>()
  if (me.role === 'student') {
    await Promise.all(
      mySubs.map(async (s) => {
        const comments = await listCommentsForSubmission(s.id)
        commentsBySub.set(s.id, comments)
      }),
    )
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Assignments" />

      {canManage && <AssignmentForm courses={courses.filter((c) => c.status === 'active')} />}

      <ul className="mt-6 space-y-3">
        {assignments.map((a) => {
          const sub = subByAssignment.get(a.id)
          const comments = sub ? (commentsBySub.get(sub.id) ?? []) : []
          return (
            <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-900">{a.title}</h3>
                  {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {courseName.get(a.course_id) ?? 'Course'} · due{' '}
                    {new Date(a.due_date).toLocaleString()}
                    {a.status === 'archived' && ' · archived'}
                  </p>
                  {/* Google Drive resource link on assignment */}
                  {a.attachment_drive_link && a.attachment_drive_link !== '#' && (
                    <a
                      href={a.attachment_drive_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      📎 Open brief in Drive ↗
                    </a>
                  )}
                </div>
                {canManage && (
                  <Link href={`/assignments/${a.id}`} className="btn btn-sm btn-soft">
                    View submissions
                  </Link>
                )}
              </div>

              {me.role === 'student' && a.status === 'active' && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {sub ? (
                    <p className="text-sm">
                      Your submission:{' '}
                      <span className={sub.status === 'late' ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                        {sub.status}
                      </span>{' '}
                      ({new Date(sub.submitted_at).toLocaleString()}) — resubmit below to replace.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">Not submitted yet.</p>
                  )}
                  <SubmitForm assignmentId={a.id} />

                  {/* Comment thread — only shown once a submission exists */}
                  {sub && (
                    <CommentThread
                      submissionId={sub.id}
                      assignmentId={a.id}
                      currentUserId={me.id}
                      currentUserRole={me.role}
                      initialComments={comments}
                    />
                  )}
                </div>
              )}
            </li>
          )
        })}
        {assignments.length === 0 && (
          <li className="p-4 text-center text-slate-400">No assignments.</li>
        )}
      </ul>
    </main>
  )
}
