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
  tone?: 'slate' | 'primary' | 'success' | 'warning' | 'danger'
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
    <h2 className={cx('text-sm font-semibold uppercase tracking-wide text-slate-400', className)}>
      {children}
      {count != null && <span className="text-slate-300"> - {count}</span>}
    </h2>
  )
}
