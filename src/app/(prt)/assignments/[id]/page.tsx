import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment } from '@/lib/repos/assignments'
import { listSubmissionsForAssignment } from '@/lib/repos/submissions'
import { listCommentsForEntities } from '@/lib/repos/comments'
import { getProfileNamesByIds } from '@/lib/repos/users'
import { canAccessClass } from '@/lib/repos/classes'
import { getClass } from '@/lib/repos/classes'
import { CommentThread } from '../../CommentThread'
import { PageHeader, Card, Avatar, EmptyState } from '../../ui'
import { LocalTime } from '../../LocalTime'

export default async function AssignmentDetail({ params }: { params: { id: string } }) {
  const me = await requireRole(['admin', 'teacher'])
  const assignment = await getAssignment(params.id)
  if (!assignment) notFound()
  // Explicit boundary: only an admin or a teacher OF THIS CLASS may review its
  // submissions (student names + links). Don't rely on RLS alone. The access
  // check, class lookup and submissions are independent — fetch in parallel.
  const [allowed, course, submissions] = await Promise.all([
    canAccessClass(me, assignment.class_id),
    getClass(assignment.class_id),
    listSubmissionsForAssignment(params.id),
  ])
  if (!allowed) notFound()

  // Names + comments both derive only from submissions — one query + one author
  // lookup each, run together.
  const [names, commentsBySub] = await Promise.all([
    getProfileNamesByIds(submissions.map((s) => s.student_id)),
    listCommentsForEntities('submission', submissions.map((s) => s.id)),
  ])

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        href={`/classroom/${assignment.class_id}/classwork`}
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-primary"
      >
        ← Back to {course?.name ?? 'class'} · Classwork
      </Link>
      <PageHeader
        title={assignment.title}
        description={<>Due <LocalTime iso={assignment.due_date} /> · {submissions.length} submission(s)</>}
      />

      <div className="mt-6 space-y-4">
        {submissions.length === 0 && <EmptyState>No submissions yet.</EmptyState>}

        {submissions.map((s) => (
          <Card key={s.id} className="p-4 transition hover:shadow">
            {/* Submission header row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={names.get(s.student_id) ?? '?'} role="student" />
                <div>
                  <p className="font-medium text-slate-900">{names.get(s.student_id) ?? s.student_id}</p>
                  <p className="text-xs text-slate-400">
                    Submitted <LocalTime iso={s.submitted_at} />
                    {' · '}
                    <span className={s.status === 'late' ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {s.status}
                    </span>
                  </p>
                </div>
              </div>
              {s.drive_link && s.drive_link !== '#' && (
                <a
                  href={s.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-soft inline-flex max-w-[14rem] items-center gap-1"
                  title={s.file_name ?? undefined}
                >
                  <span className="truncate">{s.file_name ?? 'Open in Drive'}</span>
                  <span aria-hidden>↗</span>
                </a>
              )}
            </div>

            {/* Comment thread */}
            <CommentThread
              entityType="submission"
              entityId={s.id}
              me={{ id: me.id, role: me.role }}
              initialComments={commentsBySub.get(s.id) ?? []}
            />
          </Card>
        ))}
      </div>
    </main>
  )
}
