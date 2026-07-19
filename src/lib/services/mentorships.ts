import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/lib/auth/profile'
import { getProfileById } from '@/lib/services/users'
import { requireAdminOrSubAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'

export type Mentorship = {
  id: string
  tutor_id: string
  student_id: string
  created_at: string
}

/**
 * Create a mentor-scoped persona for the tutor-student relationship.
 * This allows the mentor to access the student outside of class context.
 */
async function assignMentorPersona(tutorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  // Use 3-column conflict per DB constraint: (profile_id, persona_name, scope_id)
  const { error } = await admin
    .from('persona_assignments')
    .upsert(
      {
        profile_id: tutorId,
        persona_name: 'mentor',
        scope_type: 'student',
        scope_id: studentId,
        status: 'active',
      },
      { onConflict: 'profile_id,persona_name,scope_id' },
    )

  if (error) throw new Error(`assignMentorPersona: ${error.message}`)
}

/**
 * Remove a mentor-scoped persona when the mentorship ends.
 */
async function removeMentorPersona(tutorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('persona_assignments')
    .delete()
    .eq('profile_id', tutorId)
    .eq('persona_name', 'mentor')
    .eq('scope_type', 'student')
    .eq('scope_id', studentId)

  if (error) throw new Error(`removeMentorPersona: ${error.message}`)
}

/** RLS-scoped list of active links (admin: all, tutor: own, student: own). */
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

/** Active student ids assigned to a tutor. */
export async function studentIdsOfTutor(tutorId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mentorships')
    .select('student_id')
    .eq('tutor_id', tutorId)
    .eq('active', true)
  if (error) throw new Error(`mentorships.studentsOf: ${error.message}`)
  return (data ?? []).map((r) => (r as { student_id: string }).student_id)
}

export type MentorshipParams = { tutorId: string; studentId: string }
const mentorshipIdSchema = z.string().uuid()
const mentorshipParamsSchema = z.object({
  tutorId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export type AssignMentorActionInput = {
  tutor_id?: FormDataEntryValue | null
  student_id?: FormDataEntryValue | null
}

export type RemoveMentorActionInput = {
  id?: FormDataEntryValue | null
}

export function validateAssignMentorInput(input: AssignMentorActionInput): MentorshipParams {
  const parsed = mentorshipParamsSchema.safeParse({
    tutorId: String(input.tutor_id ?? ''),
    studentId: String(input.student_id ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid mentorship assignment data')
  }
  return parsed.data
}

export function validateRemoveMentorInput(input: RemoveMentorActionInput): string {
  const parsed = mentorshipIdSchema.safeParse(String(input.id ?? ''))
  if (!parsed.success) {
    throw new ValidationError('Invalid mentorship id')
  }
  return parsed.data
}

/**
 * Mentor assignment is managed by admin/sub_admin from the Users hub — not
 * gated by canManageClass (mentorship is pastoral, independent of which
 * class/subject the tutor teaches). The UI only offers valid options, but
 * a crafted POST could pair arbitrary ids — verify the mentor is really a
 * tutor and the mentee really a student.
 */
export async function assignMentor(actor: Profile, params: MentorshipParams): Promise<void> {
  await requireAdminOrSubAdminPersona(actor)
  const [tutor, student] = await Promise.all([
    getProfileById(params.tutorId),
    getProfileById(params.studentId),
  ])
  if (!tutor || tutor.role !== 'tutor') throw new ValidationError('tutor_id must be a tutor')
  if (!student || student.role !== 'student') throw new ValidationError('student_id must be a student')

  const admin = createAdminClient()
  // Idempotent; reactivates a previously soft-removed link.
  const { error } = await admin
    .from('mentorships')
    .upsert(
      { tutor_id: params.tutorId, student_id: params.studentId, active: true },
      { onConflict: 'tutor_id,student_id' },
    )
  if (error) throw new Error(`mentorships.assign: ${error.message}`)
  // Sync mentor-scoped persona
  await assignMentorPersona(params.tutorId, params.studentId)
  await auditPrivilegedAction(actor, 'mentorship.assign', 'mentorship', params.studentId)
}

export async function assignMentorFromActionInput(
  actor: Profile,
  input: AssignMentorActionInput,
): Promise<void> {
  await assignMentor(actor, validateAssignMentorInput(input))
}

/** Soft-remove a mentorship link by id (keeps the record). */
export async function removeMentor(actor: Profile, id: string): Promise<void> {
  await requireAdminOrSubAdminPersona(actor)
  const admin = createAdminClient()
  // Fetch the mentorship to get tutor_id and student_id for persona cleanup
  const { data: mentorship, error: fetchError } = await admin
    .from('mentorships')
    .select('tutor_id, student_id')
    .eq('id', id)
    .single()
  if (fetchError) throw new Error(`mentorships.fetch: ${fetchError.message}`)

  const { error } = await admin.from('mentorships').update({ active: false }).eq('id', id)
  if (error) throw new Error(`mentorships.remove: ${error.message}`)

  // Remove mentor-scoped persona
  if (mentorship) {
    await removeMentorPersona(mentorship.tutor_id, mentorship.student_id)
  }

  await auditPrivilegedAction(actor, 'mentorship.remove', 'mentorship', id)
}

export async function removeMentorFromActionInput(
  actor: Profile,
  input: RemoveMentorActionInput,
): Promise<void> {
  await removeMentor(actor, validateRemoveMentorInput(input))
}
