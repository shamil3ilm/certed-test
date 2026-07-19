import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from './personas'

/** Can this user manage the class (roster + settings)? Admin, or a tutor of it. */
export async function canManageClass(profile: Profile, classId: string): Promise<boolean> {
  const { isAdmin, isTutor } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (!isTutor) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('class_tutors')
    .select('id')
    .eq('tutor_id', profile.id)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}

/** Class-scoped manage rule for content that can also be academy-wide: a class
 *  action needs canManageClass; a global (null class_id) action is admin-only. */
export async function canManageScope(profile: Profile, classId: string | null): Promise<boolean> {
  if (classId === null) {
    const { isAdmin } = await loadPersonaFlags(profile.id)
    return isAdmin
  }
  return canManageClass(profile, classId)
}

/**
 * True if the caller may enter this class. Cached per-request: with `getProfile`
 * also cached, the layout and page pass the same profile ref + classId, so the
 * membership check runs once.
 */
export const canAccessClass = cache(async (profile: Profile, classId: string): Promise<boolean> => {
  const { isAdmin, isTutor, isStudent } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  const admin = createAdminClient()
  if (isTutor) {
    const { data } = await admin
      .from('class_tutors')
      .select('id')
      .eq('tutor_id', profile.id)
      .eq('class_id', classId)
      .eq('active', true)
      .maybeSingle()
    return !!data
  }
  if (isStudent) {
    const { data } = await admin
      .from('enrollments')
      .select('id')
      .eq('student_id', profile.id)
      .eq('class_id', classId)
      .eq('active', true)
      .maybeSingle()
    return !!data
  }
  return false
})
