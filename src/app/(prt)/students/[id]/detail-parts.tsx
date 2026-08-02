import Link from 'next/link'
import type { loadMenteeDetailPageData } from '@/lib/services/page-data/mentee-detail-page'
import { MessageUserButton } from '../../messages/MessageUserButton'
import { Avatar, Badge, Card, FILTER_CONTROL, FilterBar, FilterField, SectionLabel, StatCard, StatGrid } from '@/lib/ui'
import { comparisonLabel } from './detail-shared'

type MenteePageData = NonNullable<Awaited<ReturnType<typeof loadMenteeDetailPageData>>>
type Overview = MenteePageData['overview']

const PERIOD_OPTIONS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
] as const

const SORT_OPTIONS = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest', label: 'Highest score' },
  { value: 'lowest', label: 'Lowest score' },
] as const

export function MenteeHeader({ data, hasMentorAuthority }: { data: MenteePageData; hasMentorAuthority: boolean }) {
  const { student, classes } = data.overview
  const openable = new Set(data.openableClassIds)

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={data.name} role="student" size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{data.name}</h1>
            <p className="mt-0.5 truncate text-sm">
              <span className="text-slate-600">{student.email}</span>
              {student.class_level && <span className="text-slate-400"> - {student.class_level}</span>}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {hasMentorAuthority
                ? 'Your mentee - progress across all their classes.'
                : 'Overview of progress across all classes.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

      <div className="mt-5 border-t border-slate-100 pt-4">
        <SectionLabel className="mb-2">Classes</SectionLabel>
        {classes.length === 0 ? (
          <p className="text-sm text-slate-400">Not enrolled in any classes yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {classes.map((course) =>
                openable.has(course.id) ? (
                  <Link
                    key={course.id}
                    href={`/classroom/${course.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/10"
                  >
                    {course.name}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3 w-3"
                    >
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                ) : (
                  <Badge key={course.id} tone="primary">
                    {course.name}
                  </Badge>
                ),
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {openable.size > 0
                ? 'Linked classes are ones you can open; the rest are shown for context.'
                : 'For context only - open a class from your own Classes tab if you teach it.'}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

export function EvaluationOverview({
  studentId,
  classes,
  evaluations,
  searchParams,
}: {
  studentId: string
  classes: Overview['classes']
  evaluations: Overview['evaluations']
  searchParams?: { period?: string; classId?: string; sort?: string }
}) {
  return (
    <section className="mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Evaluation progress</h2>
        <p className="mt-0.5 text-sm text-slate-500">Grades, attendance and period comparison for this student.</p>
      </div>

      <FilterBar
        clearHref={`/students/${studentId}`}
        showClear={Boolean(evaluations.filters.classId || searchParams?.period || searchParams?.sort)}
      >
        <FilterField label="Period">
          <select name="period" defaultValue={evaluations.filters.period} className={FILTER_CONTROL}>
            {PERIOD_OPTIONS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Class">
          <select name="classId" defaultValue={evaluations.filters.classId ?? ''} className={FILTER_CONTROL}>
            <option value="">All classes</option>
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Sort grades">
          <select name="sort" defaultValue={evaluations.filters.sort} className={FILTER_CONTROL}>
            {SORT_OPTIONS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <StatGrid cols={4}>
        <StatCard
          label="Grade average"
          value={evaluations.grading.periodAverage == null ? '-' : `${evaluations.grading.periodAverage}%`}
          sub={comparisonLabel(evaluations.grading.previousAverage, evaluations.grading.delta)}
          tone="primary"
        />
        <StatCard
          label="Attendance rate"
          value={evaluations.attendance.periodRate == null ? '-' : `${evaluations.attendance.periodRate}%`}
          sub={comparisonLabel(evaluations.attendance.previousRate, evaluations.attendance.delta)}
          tone="primary"
        />
        <StatCard
          label="Graded work"
          value={evaluations.grading.gradedCount}
          sub={
            evaluations.grading.overallAverage == null
              ? 'No graded work yet'
              : `Overall avg ${evaluations.grading.overallAverage}%`
          }
        />
        <StatCard
          label="Attendance sessions"
          value={evaluations.attendance.totalSessions}
          sub={
            evaluations.attendance.overallRate == null
              ? 'No attendance yet'
              : `Overall rate ${evaluations.attendance.overallRate}%`
          }
        />
      </StatGrid>
    </section>
  )
}
