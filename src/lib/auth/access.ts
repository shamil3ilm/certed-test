import type { Profile } from './profile'

/**
 * Pure access decision for a course-scoped resource. The caller supplies the
 * enrollment/teaching facts (looked up via the RLS-safe helpers at the call
 * site), keeping this function trivially testable.
 */
export function canAccessResource(
  role: Profile['role'],
  ctx: { isEnrolled: boolean; teachesCourse: boolean },
): boolean {
  if (role === 'admin') return true
  if (role === 'teacher') return ctx.teachesCourse
  return ctx.isEnrolled
}
