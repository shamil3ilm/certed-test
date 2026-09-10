'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SubjectOption } from '@/lib/services/classes/subject-switcher'
import { siblingHref } from './sibling-href'

/**
 * Move between the subjects one student is taught, without going back to the list.
 *
 * A class is one student and one subject, so a tutor teaching Sam both Maths and Physics has
 * two classes. This switches between them IN PLACE: the current sub-page is preserved, so
 * switching subject from Attendance lands on the other subject's Attendance rather than
 * dropping the reader back at the stream.
 *
 * Tabs up to SUBJECTS_AS_TABS, a dropdown beyond it. Tabs read at a glance and show the
 * whole set, which is what a student with three or four subjects wants; past that they wrap
 * onto a second line and stop being scannable, and a select is both shorter and already the
 * control a reader expects for a long list.
 */

/** Above this many subjects, the tab strip stops being scannable and becomes a select. */
const SUBJECTS_AS_TABS = 4

export function SubjectSwitcher({
  studentName,
  options,
  classId,
}: {
  studentName: string
  options: SubjectOption[]
  classId: string
}) {
  const pathname = usePathname()
  // The query is part of where the reader is - a date on Attendance, a filter elsewhere - so
  // it travels with them to the other subject.
  const search = useSearchParams().toString()
  const router = useRouter()

  if (options.length < 2) return null

  const label = (
    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{studentName}</span>
  )

  if (options.length > SUBJECTS_AS_TABS) {
    const current = options.find((o) => o.current)
    return (
      <div className="flex items-center gap-3">
        {label}
        <label className="sr-only" htmlFor="subject-switcher">
          Subject
        </label>
        <select
          id="subject-switcher"
          value={current?.classId ?? classId}
          onChange={(e) => router.push(siblingHref(pathname, classId, e.target.value, search))}
          className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
        >
          {options.map((o) => (
            <option key={o.classId} value={o.classId}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label}
      <nav aria-label={`Subjects for ${studentName}`} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Link
            key={o.classId}
            href={siblingHref(pathname, classId, o.classId, search)}
            aria-current={o.current ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
              o.current ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
