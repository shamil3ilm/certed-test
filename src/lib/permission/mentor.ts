import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'

/**
 * Admin, or a teacher with an active mentorship over this student. Cached
 * per-request: the mentee page gate and getMenteeOverview's defense-in-depth
 * re-check pass the same (profile, studentId), so the check runs once.
 */
export const canMentor = cache(async (me: Profile, studentId: string): Promise<boolean> => {
  if (me.role === 'admin') return true
  if (me.role !== 'teacher') return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('mentorships')
    .select('id')
    .eq('teacher_id', me.id)
    .eq('student_id', studentId)
    .eq('active', true)
    .maybeSingle()
  return !!data
})
