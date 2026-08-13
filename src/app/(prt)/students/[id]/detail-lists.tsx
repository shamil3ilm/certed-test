import type { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { Badge, Panel, statusLabel } from '@/lib/ui'
import { LocalTime } from '../../LocalTime'
import { DriveLink, EmptyLine } from './detail-shared'

type Overview = NonNullable<Awaited<ReturnType<typeof loadMenteeDetailPageData>>>['overview']

export function NeedsAttentionPanel({ overdue }: { overdue: Overview['overdue'] }) {
  if (overdue.length === 0) return null

  return (
    <section className="mt-6">
      <Panel title="Needs attention" className="border-red-200 bg-red-50/40">
        <ul className="divide-y divide-red-100/70">
          {overdue.map((item) => (
            <li
              key={item.assignmentId}
              className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{item.assignmentTitle}</p>
                <p className="text-xs text-slate-500">{item.classLabel}</p>
              </div>
              <Badge tone="danger">
                overdue - <LocalTime iso={item.dueDate} mode="date" />
              </Badge>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  )
}

export function EvaluationPanels({ evaluations }: { evaluations: Overview['evaluations'] }) {
  return (
    <section className="mt-6 grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Graded evaluations">
        {evaluations.grading.rows.length === 0 ? (
          <EmptyLine>No graded evaluations in this selection.</EmptyLine>
        ) : (
          <ul className="divide-y divide-slate-100">
            {evaluations.grading.rows.map((row) => (
              <li
                key={`${row.assignmentId}-${row.gradedAt}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{row.assignmentTitle}</p>
                  <p className="truncate text-xs text-slate-400">
                    {row.classLabel} - graded <LocalTime iso={row.gradedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={row.percent != null && row.percent < 50 ? 'danger' : 'success'}>
                    {row.maxMarks != null
                      ? `${row.score} / ${row.maxMarks}${row.percent != null ? ` (${row.percent}%)` : ''}`
                      : row.score}
                  </Badge>
                  <DriveLink href={row.driveLink} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Attendance history">
        {evaluations.attendance.rows.length === 0 ? (
          <EmptyLine>No attendance history in this selection.</EmptyLine>
        ) : (
          <ul className="divide-y divide-slate-100">
            {evaluations.attendance.rows.map((row) => (
              <li
                key={`${row.classLabel}-${row.sessionDate}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{row.classLabel}</p>
                  <p className="text-xs text-slate-400">{row.sessionDate}</p>
                </div>
                <Badge tone={row.status === 'present' ? 'success' : row.status === 'late' ? 'warning' : 'danger'}>
                  {statusLabel(row.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}

export function RecentSubmissionsPanel({ submissions }: { submissions: Overview['submissions'] }) {
  return (
    <section className="mt-4">
      <Panel title="Recent submissions">
        {submissions.length === 0 ? (
          <EmptyLine>No submissions yet.</EmptyLine>
        ) : (
          <ul className="divide-y divide-slate-100">
            {submissions.map((submission) => (
              <li
                key={`${submission.assignmentId}-${submission.submittedAt}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{submission.assignmentTitle}</p>
                  <p className="truncate text-xs text-slate-400">
                    {submission.classLabel} - <LocalTime iso={submission.submittedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={submission.status === 'late' ? 'danger' : 'success'}>
                    {submission.status === 'late' ? 'Late' : 'On time'}
                  </Badge>
                  <DriveLink href={submission.driveLink} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  )
}
