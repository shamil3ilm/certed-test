import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { MessageUserButton } from '../../messages/MessageUserButton'
import { Avatar, Badge, Card, EmptyState, PageHeader, SectionLabel } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'

export default async function MenteePage({ params }: { params: { id: string } }) {
  // viewMentees gate (admin/tutor/mentor); the per-mentee scope is then enforced
  // by canMentor inside the loader, which returns null -> notFound for others.
  const me = await requireCapability('viewMentees')
  const data = await loadMenteeDetailPageData(me, params.id)
  if (!data) notFound()

  const { student, classes, submissions, overdue } = data.overview

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/students"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        Back to all mentees
      </Link>

      <PageHeader
        title={data.name}
        description="Your mentee - their progress across all classes, so you can look after them like a class tutor."
      />

      <div className="mb-5 flex items-center gap-3">
        <Avatar name={data.name} role="student" size="md" />
        <div className="min-w-0 text-sm">
          <a href={`mailto:${student.email}`} className="font-medium text-primary hover:underline">
            {student.email}
          </a>
          {student.class_level && <span className="text-slate-400"> - {student.class_level}</span>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <MessageUserButton recipientId={student.id} className="btn-sm btn-soft" />
          <a
            href={`/api/report-card/${student.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-soft"
          >
            Download report card
          </a>
        </div>
      </div>

      <section className="mb-6">
        <SectionLabel className="mb-2">Classes</SectionLabel>
        {classes.length === 0 ? (
          <EmptyState>Not enrolled in any classes yet.</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {classes.map((course) => (
                <Badge key={course.id} tone="primary">
                  {course.name}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              For context only - open a class from your own Classes tab if you teach it.
            </p>
          </>
        )}
      </section>

      {overdue.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-500">Needs attention</h2>
          <Card className="divide-y divide-slate-100 p-0">
            {overdue.map((item) => (
              <div key={item.assignmentId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{item.assignmentTitle}</p>
                  <p className="text-xs text-slate-400">{item.classLabel}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-600">
                  overdue - due <LocalTime iso={item.dueDate} mode="date" />
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionLabel className="mb-2">Recent submissions</SectionLabel>
        {submissions.length === 0 ? (
          <EmptyState>No submissions yet.</EmptyState>
        ) : (
          <Card className="divide-y divide-slate-100 p-0">
            {submissions.map((submission) => (
              <div
                key={`${submission.assignmentId}-${submission.submittedAt}`}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{submission.assignmentTitle}</p>
                  <p className="text-xs text-slate-400">
                    {submission.classLabel} - <LocalTime iso={submission.submittedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      submission.status === 'late'
                        ? 'text-xs font-semibold text-red-600'
                        : 'text-xs font-semibold text-emerald-700'
                    }
                  >
                    {submission.status === 'late' ? 'Late' : 'On time'}
                  </span>
                  {submission.driveLink && (
                    <a
                      href={submission.driveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Open {'->'}
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
