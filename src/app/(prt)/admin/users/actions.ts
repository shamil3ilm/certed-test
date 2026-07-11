'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
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

const TAB_FOR: Record<string, string> = { student: 'students', teacher: 'tutors', admin: 'admins' }

/** True if this profile is the only remaining active admin (must not be removed/demoted). */
async function isLastActiveAdmin(profileId: string): Promise<boolean> {
  const target = await getProfileById(profileId)
  if (!target || target.role !== 'admin' || target.status !== 'active') return false
  const activeAdmins = (await listProfiles()).filter((p) => p.role === 'admin' && p.status === 'active')
  return activeAdmins.length <= 1
}

export async function addUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = addUserSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    full_name: (formData.get('full_name') as string) || undefined,
    role: String(formData.get('role') ?? ''),
    class_level: (formData.get('class_level') as string) || undefined,
  })
  if (!parsed.success) return
  // Don't silently overwrite / reactivate an existing account behind the admin's back.
  const existing = await getProfileByEmail(parsed.data.email)
  if (existing) redirect(`/admin/users?tab=${TAB_FOR[existing.role] ?? 'students'}&error=email-exists`)

  const profile = await addUser(parsed.data)
  await writeAudit({ actor_id: me.id, action: 'user.add', entity_type: 'profile', entity_id: profile.id })

  // Optionally assign a mentor (teacher) when adding a student.
  const mentorId = String(formData.get('mentor_id') ?? '')
  if (parsed.data.role === 'student' && mentorId) {
    await assignMentor(mentorId, profile.id)
    await writeAudit({ actor_id: me.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: profile.id })
  }
  revalidatePath('/admin/users')
  redirect(`/admin/users?tab=${TAB_FOR[profile.role] ?? 'students'}&added=1`)
}

export async function revokeUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  // Never let an admin revoke themselves or the last remaining active admin.
  if (id === me.id || (await isLastActiveAdmin(id))) return
  await setUserStatus(id, 'disabled')
  await writeAudit({ actor_id: me.id, action: 'user.revoke', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setUserStatus(id, 'active')
  await writeAudit({ actor_id: me.id, action: 'user.restore', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

export async function editUserAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  const parsed = editUserSchema.safeParse({
    full_name: (formData.get('full_name') as string) || null,
    role: String(formData.get('role') ?? ''),
    class_level: (formData.get('class_level') as string) || null,
  })
  if (!id || !parsed.success) return
  // Don't allow demoting yourself, or demoting the last active admin.
  if (parsed.data.role !== 'admin' && (id === me.id || (await isLastActiveAdmin(id)))) return
  await updateUser(id, parsed.data)
  await writeAudit({ actor_id: me.id, action: 'user.edit', entity_type: 'profile', entity_id: id })
  revalidatePath('/admin/users')
}

// Mentor assignment lives inside Users now (the standalone Mentors page is gone).
export async function assignMentorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const teacher_id = String(formData.get('teacher_id') ?? '')
  const student_id = String(formData.get('student_id') ?? '')
  if (!teacher_id || !student_id) return
  await assignMentor(teacher_id, student_id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.assign', entity_type: 'mentorship', entity_id: student_id })
  revalidatePath('/admin/users')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await removeMentor(id)
  await writeAudit({ actor_id: me.id, action: 'mentorship.remove', entity_type: 'mentorship', entity_id: id })
  revalidatePath('/admin/users')
}
