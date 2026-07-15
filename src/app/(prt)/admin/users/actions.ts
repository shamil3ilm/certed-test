'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { addUserSchema, editUserSchema } from '@/lib/validation/user'
import { addUser, revokeUser, restoreUser, editUser } from '@/lib/services/users'
import { assignMentor, removeMentor } from '@/lib/services/mentorships'
import { ServiceError } from '@/lib/errors'

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

  try {
    const { profile, code } = await addUser(me, parsed.data)
    // Optionally assign a mentor (teacher) when adding a student.
    const mentorId = String(formData.get('mentor_id') ?? '')
    if (parsed.data.role === 'student' && mentorId) {
      await assignMentor(me, { teacherId: mentorId, studentId: profile.id })
    }
    revalidatePath('/admin/users')
    return { ok: true, code, email: profile.email }
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : 'Something went wrong. Please try again.' }
  }
}

// Permission checks, the sub_admin tier rules, the self/last-admin guards,
// and audit all happen inside services/users.ts and services/mentorships.ts
// now — thrown errors propagate to the portal error boundary, not swallowed.

export async function revokeUserAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await revokeUser(me, id)
  revalidatePath('/admin/users')
}

export async function restoreUserAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await restoreUser(me, id)
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
  await editUser(me, id, parsed.data)
  revalidatePath('/admin/users')
}

// Mentor assignment lives inside Users; user managers (admin + sub_admin) handle it.
export async function assignMentorAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const teacher_id = String(formData.get('teacher_id') ?? '')
  const student_id = String(formData.get('student_id') ?? '')
  if (!teacher_id || !student_id) return
  await assignMentor(me, { teacherId: teacher_id, studentId: student_id })
  revalidatePath('/admin/users')
}

export async function removeMentorAction(formData: FormData) {
  const me = await requireRole(['admin', 'sub_admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await removeMentor(me, id)
  revalidatePath('/admin/users')
}
