import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, ValidationError } from '@/lib/errors'

export type ClassTeacher = {
  id: string
  teacher_id: string
  class_id: string
  created_at: string
}

export async function listClassTeachers(classId?: string): Promise<ClassTeacher[]> {
  const supabase = await createClient()
  let query = supabase.from('class_teachers').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`classTeachers.list: ${error.message}`)
  return (data ?? []) as ClassTeacher[]
}

function requireAdmin(actor: Profile): void {
  if (actor.role !== 'admin') throw new PermissionError('Admin only.')
}

export type ClassTeacherParams = { classId: string; teacherId: string }

/**
 * Admin-only — changing a class's teaching staff is a whole-class management
 * action (see classes.ts). The UI only offers valid options, but a crafted
 * POST could pair an arbitrary profile id — verify it's really an active
 * teacher before granting class_teachers membership (which itself grants
 * full teacher-level RLS access to the class).
 */
export async function addTutor(actor: Profile, params: ClassTeacherParams): Promise<void> {
  requireAdmin(actor)
  const teacher = await getProfileById(params.teacherId)
  if (!teacher || teacher.role !== 'teacher' || teacher.status !== 'active') {
    throw new ValidationError('teacher_id must be an active teacher')
  }
  const admin = createAdminClient()
  // Re-assigning reactivates a previously soft-removed row.
  const { error } = await admin
    .from('class_teachers')
    .upsert({ teacher_id: params.teacherId, class_id: params.classId, active: true }, { onConflict: 'teacher_id,class_id' })
  if (error) throw new Error(`classTeachers.assign: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'class.assign_teacher', entity_type: 'class_teacher', entity_id: params.classId })
}

/** Soft-remove (scoped by class + teacher) — keeps the row for later re-assign. */
export async function removeTutor(actor: Profile, params: ClassTeacherParams): Promise<void> {
  requireAdmin(actor)
  const admin = createAdminClient()
  const { error } = await admin
    .from('class_teachers')
    .update({ active: false })
    .eq('class_id', params.classId)
    .eq('teacher_id', params.teacherId)
  if (error) throw new Error(`classTeachers.unassign: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'class.unassign_teacher', entity_type: 'class_teacher', entity_id: params.classId })
}
