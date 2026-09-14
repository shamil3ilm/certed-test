import type { ReactNode } from 'react'
import { CARD, cx } from '@/lib/ui'

/**
 * One student and the subjects they take, as a disclosure: the Classes list and the Grading
 * landing both group by student, and both render THIS, so the two pages cannot drift into
 * different headings for the same person.
 *
 * `<details>` rather than a client component: this is disclosure, not state worth hydrating
 * for, and the native element brings its own keyboard and screen-reader behaviour.
 *
 * `open` should be true while a filter or search is active. A reader who narrowed the list
 * asked a question whose answer is inside these groups, and making them open each one to read
 * it is the page ignoring what they just said.
 */
export function StudentGroup({
  label,
  subjectCount,
  missingSubject,
  open,
  children,
}: {
  label: string
  subjectCount: number
  /** Whether any of this student's classes has no subject set. */
  missingSubject: boolean
  open: boolean
  children: ReactNode
}) {
  return (
    <section aria-label={label}>
      <details open={open} className={cx(CARD, 'group/disclosure overflow-hidden')}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20"
          >
            {label.slice(0, 1).toUpperCase()}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {label}
          </h2>
          <span className="shrink-0 text-meta font-medium text-slate-500">
            {subjectCount} {subjectCount === 1 ? 'subject' : 'subjects'}
          </span>
          {/* Anything ACTIONABLE inside has to show on the closed row, or collapsing the group
              hides it: a subject-less class records sessions no filter can reach, and it is found
              by scanning this list. A count nobody can act on from here would be noise; this one
              is the reason to open the group. */}
          {missingSubject && (
            <span className="shrink-0 rounded-full bg-warning-tint px-2 py-0.5 text-meta font-semibold text-warning-ink">
              No subject set
            </span>
          )}
          {/* Rotates with the disclosure, so the control says which way it goes. */}
          <svg
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open/disclosure:rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </summary>
        <div className="grid gap-4 border-t border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </details>
    </section>
  )
}
