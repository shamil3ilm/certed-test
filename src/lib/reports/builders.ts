import type { ReportCardData } from '@/lib/report-card/data'
import type { ReportDoc } from '@/lib/pdf/report'

/**
 * Pure ReportDoc builders - domain data in, a template-ready
 * document out. No IO, so they unit-test directly. Both reuse the gated
 * report-card dataset (marks + attendance) so no new access path is opened.
 */

function studentName(data: ReportCardData): string {
  return data.student.full_name ?? data.student.email
}

/** Student Progress Report: weighted average + attendance headline, then the
 *  full assessment breakdown. */
export function buildProgressReport(data: ReportCardData, generatedOn: string): ReportDoc {
  const average = data.average
    ? `${data.average.percent}% over ${data.average.gradedCount} graded item${data.average.gradedCount === 1 ? '' : 's'}`
    : 'No graded work yet'
  const { present, late, absent, total, rate } = data.attendance

  return {
    kind: 'STUDENT PROGRESS REPORT',
    title: studentName(data),
    subtitle: data.student.class_level ?? null,
    reference: [{ label: 'Generated', value: generatedOn }],
    sections: [
      {
        heading: 'Overall',
        meta: [
          { label: 'Weighted average', value: average },
          { label: 'Attendance', value: `${rate}% (${present + late}/${total} attended)` },
        ],
      },
      {
        heading: 'Assessments',
        table: {
          columns: ['Class', 'Assessment', 'Score'],
          align: ['left', 'left', 'right'] as ('left' | 'right')[],
          rows: data.marks.map((m) => [
            m.className,
            m.topic ? `${m.topic} - ${m.title}` : m.title,
            m.maxMarks != null ? `${m.score} / ${m.maxMarks}` : `${m.score}`,
          ]),
        },
      },
    ],
    footer: `Absent ${absent} of ${total} recorded session${total === 1 ? '' : 's'}. Generated from graded work and attendance on record.`,
  }
}

/** Attendance Report: the attendance summary. Per-session join/leave + working
 *  hours live on the class Attendance tab. */
export function buildAttendanceReport(data: ReportCardData, generatedOn: string): ReportDoc {
  const { present, late, absent, total, rate } = data.attendance
  return {
    kind: 'ATTENDANCE REPORT',
    title: studentName(data),
    subtitle: data.student.class_level ?? null,
    reference: [{ label: 'Generated', value: generatedOn }],
    sections: [
      {
        heading: 'Summary',
        meta: [
          { label: 'Attendance rate', value: `${rate}%` },
          { label: 'Sessions recorded', value: String(total) },
          { label: 'Present', value: String(present) },
          { label: 'Late', value: String(late) },
          { label: 'Absent', value: String(absent) },
        ],
      },
    ],
    footer:
      'Late attendance counts as attended for the rate. Per-session join/leave times and working hours are on the class Attendance tab.',
  }
}
