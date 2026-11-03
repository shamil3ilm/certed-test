import Link from 'next/link'
import { GraduationCap, User } from 'lucide-react'
import type { ClassSummary } from '@/lib/services/classes'
import type { Tag } from '@/lib/services/tags'
import { Badge, CARD, CLASS_BANNER, RowChevron, cx } from '@/lib/ui'
import { TagChips } from '../tags/TagChips'

/** A 1-on-1 class names its single member; a group class (or an empty one) keeps
 *  the count. A student sees who teaches them; everyone else sees who is taught. */
function memberSummary(members: ClassSummary['students'] | undefined, count: number, noun: string): string {
  if (!members || members.length === 0) return `${count} ${noun}${count !== 1 ? 's' : ''}`
  if (members.length === 1) return members[0].name
  return `${count} ${noun}${count !== 1 ? 's' : ''}`
}

export function ClassCard({
  c,
  viewerIsStudent = false,
  viewerIsTutor = false,
  grouped = false,
  subjectName,
  tags = [],
  href,
  actionLabel,
}: {
  c: ClassSummary
  viewerIsStudent?: boolean
  viewerIsTutor?: boolean
  grouped?: boolean
  subjectName?: string
  tags?: Tag[]
  href?: string
  actionLabel?: string
}) {
  const primary = viewerIsStudent
    ? memberSummary(c.tutors, c.tutorCount ?? 0, 'tutor')
    : memberSummary(c.students, c.studentCount ?? 0, 'student')
  const Title = grouped ? 'h3' : 'h2'
  const studentIsImplied = grouped || viewerIsStudent
  const title = studentIsImplied ? (subjectName ?? c.name) : c.name
  const linkHref = href ?? `/classroom/${c.id}`

  return (
    <Link
      href={linkHref}
      className={cx(CARD, 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md')}
    >
      {grouped ? (
        <div className="relative px-4 py-3 sm:px-5">
          <span aria-hidden="true" className={cx('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', CLASS_BANNER)} />
          <Title className="text-base font-semibold leading-snug text-slate-900">{title}</Title>
          <p className="mt-0.5 text-meta font-medium text-slate-600">
            {c.status === 'archived' ? 'Archived' : 'Active class'}
          </p>
          {!c.subject_id && (
            <div className="mt-1">
              <Badge tone="warning">No subject set</Badge>
            </div>
          )}
        </div>
      ) : (
        <div className={`relative bg-gradient-to-br ${CLASS_BANNER} p-4 sm:p-5`}>
          <Title className="pr-10 text-base font-bold leading-snug text-white sm:text-lg">{title}</Title>
          <p className="mt-0.5 text-xs font-medium text-white/80">
            {c.status === 'archived' ? 'Archived' : 'Active class'}
          </p>
          {!c.subject_id && (
            <div className="mt-1">
              <Badge tone="warning">No subject set</Badge>
            </div>
          )}
          <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold text-white ring-1 ring-white/30">
            {title.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {!grouped && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <User className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
              <span className="truncate">{primary}</span>
            </span>
          )}
          {!viewerIsStudent && (!viewerIsTutor || (c.tutorCount ?? 0) > 1) && c.tutors && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-slate-600" aria-hidden="true" />
              {memberSummary(c.tutors, c.tutorCount ?? 0, 'tutor')}
            </span>
          )}
          {actionLabel && <span className="font-medium text-slate-700">{actionLabel}</span>}
          <RowChevron className="ml-auto shrink-0" />
        </div>
        {tags.length > 0 && <TagChips tags={tags} className="mt-2.5" />}
      </div>
    </Link>
  )
}
