import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { requireAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'

export type ClassTutor = {
  id: string
  tutor_id: string
  class_id: string
  created_at: string
}

export async function listClassTutors(classId?: string): Promise<ClassTutor[]> {
  const supabase = await createClient()
  let query = supabase.from('class_tutors').select('*').eq('active', true)
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`classTutors.list: ${error.message}`)
  return (data ?? []) as ClassTutor[]
}

// Use requireAdminPersona from personas.ts instead of local implementation

export type ClassTutorParams = { classId: string; tutorId: string }
export type ClassTutorActionInput = { class_id?: FormDataEntryValue | null; tutor_id?: FormDataEntryValue | null }

const classTutorParamsSchema = z.object({
  classId: z.string().uuid(),
  tutorId: z.string().uuid(),
})

export function validateClassTutorParams(input: ClassTutorActionInput): ClassTutorParams {
  const parsed = classTutorParamsSchema.safeParse({
    classId: String(input.class_id ?? ''),
    tutorId: String(input.tutor_id ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid class-tutor assignment data')
  }
  return parsed.data
}

/**
 * Admin-only — changing a class's teaching staff is a whole-class management
 * action (see classes.ts). The UI only offers valid options, but a crafted
 * POST could pair an arbitrary profile id — verify it's really an active
 * tutor before granting class_tutors membership (which itself grants
 * full tutor-level RLS access to the class).
 */
export async function addTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireAdminPersona(actor)
  const tutor = await getProfileById(params.tutorId)
  if (!tutor || tutor.role !== 'tutor' || tutor.status !== 'active') {
    throw new ValidationError('tutor_id must be an active tutor')
  }
  const admin = createAdminClient()
  // Re-assigning reactivates a previously soft-removed row.
  const { error } = await admin
    .from('class_tutors')
    .upsert({ tutor_id: params.tutorId, class_id: params.classId, active: true }, { onConflict: 'tutor_id,class_id' })
  if (error) throw new Error(`classTutors.assign: ${error.message}`)
  await auditPrivilegedAction(actor, 'class.assign_tutor', 'class_tutor', params.classId)
}

export async function addTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await addTutor(actor, validateClassTutorParams(input))
}

/** Soft-remove (scoped by class + tutor) — keeps the row for later re-assign. */
export async function removeTutor(actor: Profile, params: ClassTutorParams): Promise<void> {
  await requireAdminPersona(actor)
  const admin = createAdminClient()
  const { error } = await admin
    .from('class_tutors')
    .update({ active: false })
    .eq('class_id', params.classId)
    .eq('tutor_id', params.tutorId)
  if (error) throw new Error(`classTutors.unassign: ${error.message}`)
  await auditPrivilegedAction(actor, 'class.unassign_tutor', 'class_tutor', params.classId)
}

export async function removeTutorFromActionInput(actor: Profile, input: ClassTutorActionInput): Promise<void> {
  await removeTutor(actor, validateClassTutorParams(input))
}
