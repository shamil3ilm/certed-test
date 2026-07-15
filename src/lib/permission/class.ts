import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'

/** Can this user manage the class (roster + settings)? Admin, or a tutor of it. */
export async function canManageClass(profile: Profile, classId: string): Promise<boolean> {
  if (profile.role === 'admin') return true
  if (profile.role !== 'teacher') return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('class_teachers')
    .select('id')
    .eq('teacher_id', profile.id)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}

/** Class-scoped manage rule for content that can also be academy-wide: a class
 *  action needs canManageClass; a global (null class_id) action is admin-only. */
export async function canManageScope(profile: Profile, classId: string | null): Promise<boolean> {
  return classId === null ? profile.role === 'admin' : canManageClass(profile, classId)
}

/**
 * True if the caller may enter this class. Cached per-request: with `getProfile`
 * also cached, the layout and page pass the same profile ref + classId, so the
 * membership check runs once.
 */
export const canAccessClass = cache(async (profile: Profile, classId: string): Promise<boolean> => {
  if (profile.role === 'admin') return true
  const admin = createAdminClient()
  if (profile.role === 'teacher') {
    const { data } = await admin
      .from('class_teachers')
      .select('id')
      .eq('teacher_id', profile.id)
      .eq('class_id', classId)
      .eq('active', true)
      .maybeSingle()
    return !!data
  }
  const { data } = await admin
    .from('enrollments')
    .select('id')
    .eq('student_id', profile.id)
    .eq('class_id', classId)
    .eq('active', true)
    .maybeSingle()
  return !!data
})
