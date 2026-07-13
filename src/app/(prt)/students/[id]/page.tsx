import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { canMentor, getMenteeOverview } from '@/lib/repos/mentees'
import { PageHeader, Card, Avatar, EmptyState, Badge } from '../../ui'
import { LocalTime } from '../../LocalTime'

export default async function MenteePage({ params }: { params: { id: string } }) {
  const me = await requireRole(['admin', 'teacher'])
  if (!(await canMentor(me, params.id))) notFound()
  const overview = await getMenteeOverview(me, params.id)
  if (!overview) notFound()
  const { student, classes, submissions, overdue } = overview
  const name = student.full_name ?? student.email

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/students"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        ← All mentees
      </Link>

      <PageHeader
        title={name}
        description="Your mentee — their progress across all classes, so you can look after them like a class teacher."
      />

      <div className="mb-5 flex items-center gap-3">
        <Avatar name={name} role="student" size="md" />
        <div className="min-w-0 text-sm">
          <a href={`mailto:${student.email}`} className="font-medium text-primary hover:underline">
            {student.email}
          </a>
          {student.class_level && <span className="text-slate-400"> · {student.class_level}</span>}
        </div>
        <a
          href={`/api/report-card/${student.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-soft ml-auto shrink-0"
        >
          Download report card
        </a>
      </div>

      {/* Classes */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Classes</h2>
        {classes.length === 0 ? (
          <EmptyState>Not enrolled in any classes yet.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {/* Not links: a mentor may not teach these classes, so the workspace
                would 404. The names are context, not navigation. */}
            {classes.map((c) => (
              <Badge key={c.id} tone="primary">{c.name}</Badge>
            ))}
          </div>
        )}
      </section>

      {/* Needs attention */}
      {overdue.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-500">Needs attention</h2>
          <Card className="divide-y divide-slate-100 p-0">
            {overdue.map((o) => (
              <div key={o.assignmentId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{o.assignmentTitle}</p>
                  <p className="text-xs text-slate-400">{o.classLabel}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-600">
                  overdue · due <LocalTime iso={o.dueDate} mode="date" />
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Recent submissions */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent submissions</h2>
        {submissions.length === 0 ? (
          <EmptyState>No submissions yet.</EmptyState>
        ) : (
          <Card className="divide-y divide-slate-100 p-0">
            {submissions.map((s) => (
              <div key={`${s.assignmentId}-${s.submittedAt}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{s.assignmentTitle}</p>
                  <p className="text-xs text-slate-400">
                    {s.classLabel} · <LocalTime iso={s.submittedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={s.status === 'late' ? 'text-xs font-semibold text-red-600' : 'text-xs font-semibold text-emerald-700'}>
                    {s.status === 'late' ? 'Late' : 'On time'}
                  </span>
                  {s.driveLink && (
                    <a href={s.driveLink} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </main>
  )
}
