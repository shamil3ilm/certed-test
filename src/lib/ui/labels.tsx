import type { ReactNode } from 'react'
import { cx } from './core'

/* Text labels and small status chips. These map a stored role / persona set to a
 * DISPLAY string only - the authorization meaning of a persona lives in
 * src/lib/capabilities, never here. */

/** Display label for a profile's role (its fixed identity). Use for rows that
 *  carry a stored role - comment authors, the Users list - where loading personas
 *  per row would be an N+1. For the signed-in user prefer personaLabel, whose
 *  personas are already in the actor context. */
export function roleLabel(role?: string | null): string {
  if (role === 'tutor') return 'Tutor'
  if (role === 'mentor') return 'Mentor'
  if (role === 'admin') return 'Super Admin'
  if (role === 'sub_admin') return 'Sub Admin'
  return 'Student'
}

/** Title-cased display label for an account status - the single source so a status
 *  never reads as a raw lowercase 'active' in one place and Title-case elsewhere. */
export function statusLabel(status?: string | null): string {
  if (!status) return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
}

/** The tones a Badge accepts, named once so a tone helper cannot drift from it. */
export type BadgeTone = 'slate' | 'primary' | 'success' | 'warning' | 'danger'

/**
 * Badge tone for an ACCOUNT status (active / pending / anything else).
 *
 * The single source. This mapping was written out twice - once as `statusChipTone` on the
 * Users list and once as `statusTone` on the user detail card - byte-identical but free to
 * diverge, and the second name collided with a THIRD `statusTone` that meant attendance.
 * One name, one meaning.
 */
export function profileStatusTone(status?: string | null): BadgeTone {
  if (status === 'active') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
}

/**
 * Badge tone for an ATTENDANCE mark.
 *
 * Late is a WARNING, not a failure: the student came. Deliberately the same tone the
 * submission helper below gives a late hand-in, because a reader meeting both badges on one
 * page (the student detail page shows attendance above submissions) cannot be expected to
 * learn that amber and red both mean "late" depending on which list they are in.
 */
export function attendanceTone(status?: string | null): BadgeTone {
  if (status === 'present') return 'success'
  if (status === 'late') return 'warning'
  return 'danger'
}

/** Badge tone for a SUBMISSION's delivery: on time, or late. See attendanceTone for why
 *  late is amber in both. */
export function submissionTone(status?: string | null): BadgeTone {
  return status === 'late' ? 'warning' : 'success'
}

/** The words for that badge. Written three ways before this existed - "Submitted late",
 *  "Late" and a lowercase "late" - for one state. */
export function submissionLabel(status?: string | null): string {
  return status === 'late' ? 'Late' : 'On time'
}

/** Label for the /students section - the SINGLE source shared by the nav and the
 *  page header so they never disagree. An oversight admin sees the mentoring
 *  PROGRAMME ("Mentoring"); a mentor sees their own people ("Mentees"). */
export function mentoringSectionLabel(isOversight: boolean): string {
  return isOversight ? 'Mentoring' : 'Mentees'
}

/** The single label for the "not one class, the whole academy" scope - used as
 *  both the picker option and the rendered badge. Previously written six ways
 *  ("Global (all classes)", "Global (all)", "Academy-wide", ...) across the
 *  calendar and meeting composers. */
export const ACADEMY_WIDE_LABEL = 'Academy-wide'

/** Staff label for admin-facing lists. A `mentor` who also teaches, or a `tutor`
 *  who also holds a mentor persona, is the same hybrid and must read the same way
 *  ("Tutor & Mentor") as personaLabel gives the person on their own dashboard -
 *  hence both the `teaches` and `mentors` flags, resolved by the caller. */
export function staffRoleLabel(input: { role?: string | null; teaches?: boolean; mentors?: boolean }): string {
  if (input.role === 'mentor') return input.teaches ? 'Tutor & Mentor' : 'Mentor'
  if (input.role === 'tutor') return input.mentors ? 'Tutor & Mentor' : 'Tutor'
  return roleLabel(input.role)
}

/** Highest-privilege label for a set of active personas - the persona-native
 *  counterpart to roleLabel, reflecting the real authorization model rather than
 *  a single profiles.role value. */
export function personaLabel(
  personas: ReadonlyArray<{ persona_name: string; scope_type: string; status: string }>,
): string {
  const hasGlobal = (name: string) =>
    personas.some((p) => p.persona_name === name && p.scope_type === 'global' && p.status === 'active')
  const hasMentor = personas.some((p) => p.persona_name === 'mentor' && p.status === 'active')
  if (hasGlobal('admin')) return 'Super Admin'
  if (hasGlobal('sub_admin')) return 'Sub Admin'
  // A tutor who also mentors is a hybrid: the mentor dashboard shows their mentees,
  // so the identity label must say so too rather than read as a plain Tutor.
  if (hasGlobal('tutor')) return hasMentor ? 'Tutor & Mentor' : 'Tutor'
  if (hasMentor) return 'Mentor'
  return 'Student'
}

/** Small status pill. */
export function Badge({
  tone = 'slate',
  className = '',
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** An uppercase subsection label with an optional trailing count - the small
 *  heading used above class rosters, the grading queue, and classwork sections. */
export function SectionLabel({
  count,
  className = '',
  children,
}: {
  count?: number
  className?: string
  children: ReactNode
}) {
  return (
    <h2 className={cx('text-sm font-semibold uppercase tracking-wide text-slate-600', className)}>
      {children}
      {/* slate-500, not 300: this is the section COUNT, and slate-300 on white is 1.48:1 -
          present in the DOM and absent to the reader. Muted is lighter than the label, not
          invisible. */}
      {count != null && <span className="text-slate-500"> - {count}</span>}
    </h2>
  )
}
