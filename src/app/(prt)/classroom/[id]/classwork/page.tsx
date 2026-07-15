import Link from 'next/link'
import { requireClassAccess } from '../../access'
import { listAssignments } from '@/lib/services/assignments'
import { listResources } from '@/lib/services/resources'
import { listMyActiveSubmissions } from '@/lib/services/submissions'
import { listCommentsForEntities } from '@/lib/services/comments'
import { AssignmentForm } from '../../../assignments/AssignmentForm'
import { SubmitForm } from '../../../assignments/SubmitForm'
import { EditAssignment } from '../../../assignments/EditAssignment'
import { archiveAssignmentAction, deleteResourceAction } from '../../../assignments/manage-actions'
import { UploadForm } from '../../../resources/UploadForm'
import { CommentThread } from '../../../CommentThread'
import { ConfirmSubmit } from '../../../ConfirmSubmit'
import { Card, EmptyState, Badge } from '../../../ui'
import { LocalTime } from '../../../LocalTime'

export default async function ClassworkPage({ params }: { params: { id: string } }) {
  const { me, course } = await requireClassAccess(params.id)
  const canManage = me.role === 'admin' || me.role === 'teacher'
  const classList = [{ id: course.id, name: course.name }]

  const [assignments, resources, mySubs] = await Promise.all([
    listAssignments({ classId: course.id }),
    listResources(course.id),
    me.role === 'student' ? listMyActiveSubmissions(me.id) : Promise.resolve([]),
  ])
  const subByAssignment = new Map(mySubs.map((s) => [s.assignment_id, s]))
  // Precomputed so the empty-state check matches the list students actually see.
  const visibleAssignments = assignments.filter((a) => canManage || a.status === 'active')
  // Server Component — renders once per request, so a request-time clock is safe.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // Comment state — the submission + resource loads are independent, so batch them.
  const [commentsBySub, resourceComments] = await Promise.all([
    me.role === 'student'
      ? listCommentsForEntities('submission', mySubs.map((s) => s.id))
      : Promise.resolve(new Map()),
    listCommentsForEntities('resource', resources.map((r) => r.id)),
  ])

  return (
    <div className="space-y-10">
      {/* Assignments */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Assignments</h2>
        {canManage && <AssignmentForm classes={classList} />}

        <ul className="space-y-3">
          {visibleAssignments.map((a) => {
            const sub = subByAssignment.get(a.id)
            const comments = sub ? (commentsBySub.get(sub.id) ?? []) : []
            return (
              <Card as="li" key={a.id} id={`assignment-${a.id}`} className="scroll-mt-24 p-4 transition hover:shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-slate-900">{a.title}</h3>
                      {a.topic && <Badge tone="primary">{a.topic}</Badge>}
                      {a.max_marks != null && <span className="text-xs text-slate-400">/ {Number(a.max_marks)} marks</span>}
                    </div>
                    {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>due <LocalTime iso={a.due_date} /></span>
                      {a.status === 'archived' && <span>· archived</span>}
                      {a.status === 'active' && !sub && Date.parse(a.due_date) < now && (
                        <Badge tone="danger">Overdue</Badge>
                      )}
                      {a.status === 'active' && !sub && Date.parse(a.due_date) >= now &&
                        Date.parse(a.due_date) - now < 172800000 && <Badge tone="warning">Due soon</Badge>}
                    </p>
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
                </div>

                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={`/assignments/${a.id}`} className="btn btn-sm btn-soft">
                      View submissions
                    </Link>
                    <EditAssignment assignment={a} />
                    <form action={archiveAssignmentAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value={a.status === 'archived' ? 'active' : 'archived'} />
                      <button className={`btn btn-sm ${a.status === 'archived' ? 'btn-success' : 'btn-warning'}`}>
                        {a.status === 'archived' ? 'Restore' : 'Archive'}
                      </button>
                    </form>
                  </div>
                )}

                {me.role === 'student' && a.status === 'active' && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {sub ? (
                      <div className="text-sm">
                        <p>
                          Your submission:{' '}
                          <span
                            className={
                              sub.status === 'late'
                                ? 'font-semibold text-red-600'
                                : 'font-semibold text-emerald-700'
                            }
                          >
                            {sub.status === 'late' ? 'Submitted late' : 'On time ✓'}
                          </span>{' '}
                          (<LocalTime iso={sub.submitted_at} />)
                          {sub.score == null && <> — resubmit below to replace.</>}
                        </p>
                        {sub.score != null && (
                          <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                            <span className="font-semibold">
                              Marked: {Number(sub.score)}
                              {a.max_marks != null ? ` / ${Number(a.max_marks)}` : ''}
                            </span>
                            {sub.feedback && <span className="mt-0.5 block text-emerald-700">“{sub.feedback}”</span>}
                          </p>
                        )}
                        {sub.drive_link && (
                          <a
                            href={sub.drive_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
                            title={sub.file_name ?? undefined}
                          >
                            <span className="truncate">{sub.file_name ?? 'Open your submission'}</span>
                            <span aria-hidden>↗</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Not submitted yet.</p>
                    )}
                    {sub && sub.score != null ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Graded — ask your tutor to reopen it (clear the mark) if you need to resubmit.
                      </p>
                    ) : (
                      <SubmitForm assignmentId={a.id} studentEmail={me.email} />
                    )}
                    {sub && (
                      <CommentThread
                        entityType="submission"
                        entityId={sub.id}
                        me={{ id: me.id, role: me.role }}
                        initialComments={comments}
                      />
                    )}
                  </div>
                )}
              </Card>
            )
          })}
          {visibleAssignments.length === 0 && (
            <EmptyState as="li">No assignments yet.</EmptyState>
          )}
        </ul>
      </section>

      {/* Materials / resources */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Materials</h2>
        {canManage && <UploadForm classes={classList} />}

        <ul className="space-y-4">
          {resources.map((r) => {
            return (
              <Card as="li" key={r.id} interactive className="p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{r.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400"><LocalTime iso={r.created_at} mode="date" /></p>
                  </div>
                  <a
                    href={`/api/resources/${r.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-soft"
                  >
                    Open Link
                  </a>
                  {canManage && (
                    <form action={deleteResourceAction}>
                      <input type="hidden" name="id" value={r.id} />
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
                  entityId={r.id}
                  me={{ id: me.id, role: me.role }}
                  initialComments={resourceComments.get(r.id) ?? []}
                  placeholder="Ask a question or discuss…"
                />
              </Card>
            )
          })}
          {resources.length === 0 && (
            <EmptyState as="li">No materials shared yet.</EmptyState>
          )}
        </ul>
      </section>
    </div>
  )
}
