'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import type { Profile } from '@/lib/auth/profile'
import { addUserSchema, editUserSchema } from '@/lib/validation/user'
import {
  addUser,
  setUserStatus,
  updateUser,
  listProfiles,
  getProfileById,
  getProfileByEmail,
} from '@/lib/repos/users'
import { assignMentor, removeMentor } from '@/lib/repos/mentorships'
import { writeAudit } from '@/lib/repos/audit'
import { generateSetupCode, hashSetupCode, setupCodeExpiry } from '@/lib/auth/setupCode'

// Admin-tier roles a Sub Admin can neither create nor manage.
const ADMIN_TIER = new Set(['admin', 'sub_admin'])

/** A Sub Admin may only act on teacher/student accounts; a Super Admin on anyone. */
function canManageTarget(actor: Profile, targetRole: string): boolean {
  if (actor.role === 'admin') return true
  return actor.role === 'sub_admin' && !ADMIN_TIER.has(targetRole)
}

/** True if this profile is the only remaining active Super Admin (must not be removed/demoted). */
async function isLastActiveAdmin(profileId: string): Promise<boolean> {
  const target = await getProfileById(profileId)
  if (!target || target.role !== 'admin' || target.status !== 'active') return false
  const activeAdmins = (await listProfiles()).filter((p) => p.role === 'admin' && p.status === 'active')
  return activeAdmins.length <= 1
}

export type AddUserState = { ok?: boolean; code?: string; email?: string; error?: string }

export async function addUserAction(_prev: AddUserState, formData: FormData): Promise<AddUserState> {
  const me = await requireRole(['admin', 'sub_admin'])
  const parsed = addUserSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    full_name: (formData.get('full_name') as string) || undefined,
    role: String(formData.get('role') ?? ''),
    class_level: (formData.get('class_level') as string) || undefined,
  })
  if (!parsed.success) return { error: 'Check the email and fields.' }

  // A Sub Admin can only create teacher/student accounts — never the admin tier.
  if (!canManageTarget(me, parsed.data.role)) return { error: 'You can only add tutors and students.' }

  // Don't silently overwrite / reactivate an existing account behind the admin's back.
  const existing = await getProfileByEmail(parsed.data.email)
  if (existing) return { error: 'A user with that email already exists — edit them in the list instead.' }

  const code = generateSetupCode()
  const profile = await addUser(parsed.data, { hash: hashSetupCode(code), expiresAt: setupCodeExpiry() })
  await writeAudit({ actor_id: me.id, action: 'user.add', entity_type: 'profile', entity_id: profile.id })

  // Optionally assign a mentor (teacher) when adding a student.
  const mentorId = String(formData.get('mentor_id') ?? '')
  if (parsed.data.role === 'student' && mentorId) {
    await assignMentor(mentorId, profile.id)
    await writeAudit({ actor_id: me.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: profile.id })
  }
  revalidatePath('/admin/users')
  return { ok: true, code, email: profile.email }
}

export async function revokeUserAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const target = await getProfileById(id)
  if (!target || !canManageTarget(me, target.role)) return
  // Never let an admin revoke themselves or the last remaining active Super Admin.
  if (id === me.id || (await isLastActiveAdmin(id))) return
  await setUserStatus(id, 'disabled')
  await writeAudit({ actor_id: me.id, action: 'user.revoke', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const target = await getProfileById(id)
  if (!target || !canManageTarget(me, target.role)) return
  await setUserStatus(id, 'active')
  await writeAudit({ actor_id: me.id, action: 'user.restore', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

export async function editUserAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  const parsed = editUserSchema.safeParse({
    full_name: (formData.get('full_name') as string) || null,
    role: String(formData.get('role') ?? ''),
    class_level: (formData.get('class_level') as string) || null,
  })
  if (!id || !parsed.success) return
  const target = await getProfileById(id)
  if (!target || !canManageTarget(me, target.role)) return
  // A Sub Admin cannot promote anyone into the admin tier.
  if (me.role === 'sub_admin' && parsed.data.role && ADMIN_TIER.has(parsed.data.role)) return
  // Don't allow demoting yourself, or demoting the last active Super Admin.
  if (parsed.data.role !== 'admin' && (id === me.id || (await isLastActiveAdmin(id)))) return
  await updateUser(id, parsed.data)
  await writeAudit({ actor_id: me.id, action: 'user.edit', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

// Mentor assignment lives inside Users; user managers (admin + sub_admin) handle it.
export async function assignMentorAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const teacher_id = String(formData.get('teacher_id') ?? '')
  const student_id = String(formData.get('student_id') ?? '')
  if (!teacher_id || !student_id) return
  // The UI only offers valid options, but a crafted POST could pair arbitrary
  // ids — verify the mentor is really a teacher and the mentee really a student.
  const [teacher, student] = await Promise.all([getProfileById(teacher_id), getProfileById(student_id)])
  if (!teacher || teacher.role !== 'teacher') return
  if (!student || student.role !== 'student') return
  await assignMentor(teacher_id, student_id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: student_id })
  revalidatePath('/admin/users')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await removeMentor(id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.remove', entity_type: 'mentorship', entity_id: id })
  revalidatePath('/admin/users')
}
