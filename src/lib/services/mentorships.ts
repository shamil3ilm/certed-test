import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, ValidationError } from '@/lib/errors'

export type Mentorship = {
  id: string
  teacher_id: string
  student_id: string
  created_at: string
}

/** RLS-scoped list of active links (admin: all, teacher: own, student: own). */
export async function listMentorships(): Promise<Mentorship[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('mentorships').select('*').eq('active', true)
  if (error) throw new Error(`mentorships.list: ${error.message}`)
  return (data ?? []) as Mentorship[]
}

/** Service-role: the Users hub is gated (admin + sub_admin) in code, and RLS
 *  is_active_admin() would otherwise hide every link from a sub_admin (same
 *  reasoning as listProfiles). Use only from admin/sub_admin-gated pages. */
export async function listMentorshipsForUsersHub(): Promise<Mentorship[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('mentorships').select('*').eq('active', true)
  if (error) throw new Error(`mentorships.listForUsersHub: ${error.message}`)
  return (data ?? []) as Mentorship[]
}

/** Active student ids assigned to a teacher. */
export async function studentIdsOfTeacher(teacherId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mentorships')
    .select('student_id')
    .eq('teacher_id', teacherId)
    .eq('active', true)
  if (error) throw new Error(`mentorships.studentsOf: ${error.message}`)
  return (data ?? []).map((r) => (r as { student_id: string }).student_id)
}

export type MentorshipParams = { teacherId: string; studentId: string }

/**
 * Mentor assignment is managed by admin/sub_admin from the Users hub — not
 * gated by canManageClass (mentorship is pastoral, independent of which
 * class/subject the teacher teaches). The UI only offers valid options, but
 * a crafted POST could pair arbitrary ids — verify the mentor is really a
 * teacher and the mentee really a student.
 */
export async function assignMentor(actor: Profile, params: MentorshipParams): Promise<void> {
  if (actor.role !== 'admin' && actor.role !== 'sub_admin') {
    throw new PermissionError('Not authorized to assign mentors.')
  }
  const [teacher, student] = await Promise.all([
    getProfileById(params.teacherId),
    getProfileById(params.studentId),
  ])
  if (!teacher || teacher.role !== 'teacher') throw new ValidationError('teacher_id must be a teacher')
  if (!student || student.role !== 'student') throw new ValidationError('student_id must be a student')

  const admin = createAdminClient()
  // Idempotent; reactivates a previously soft-removed link.
  const { error } = await admin
    .from('mentorships')
    .upsert(
      { teacher_id: params.teacherId, student_id: params.studentId, active: true },
      { onConflict: 'teacher_id,student_id' },
    )
  if (error) throw new Error(`mentorships.assign: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: params.studentId })
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  if (actor.role !== 'admin' && actor.role !== 'sub_admin') {
    throw new PermissionError('Not authorized to remove mentors.')
  }
  const admin = createAdminClient()
  const { error } = await admin.from('mentorships').update({ active: false }).eq('id', id)
  if (error) throw new Error(`mentorships.remove: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'mentorship.remove', entity_type: 'mentorship', entity_id: id })
}
