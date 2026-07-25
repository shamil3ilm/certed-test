import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags, hasScopedPersona } from './personas'

/**
 * Admin, or a mentor with an active student-scoped mentor persona over this
 * student. Cached per-request: the mentee page gate and getMenteeOverview's
 * defense-in-depth re-check pass the same (profile, studentId), so the check
 * runs once.
 *
 * Authority: purely persona-based (admin + mentor-scoped personas).
 * The mentorships table is synced by assignMentor/removeMentor and is no longer
 * consulted for authorization - personas are the single source of truth.
 */
export const canMentor = cache(async (me: Profile, studentId: string): Promise<boolean> => {
  const { isAdmin, personas } = await loadPersonaFlags(me.id)
  if (isAdmin) return true
  if (hasScopedPersona(personas, 'mentor', studentId)) return true
  return false
})
