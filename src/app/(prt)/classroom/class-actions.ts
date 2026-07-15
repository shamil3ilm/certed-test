'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { createClassSchema } from '@/lib/validation/class'
import { createClass, archiveClass, restoreClass, renameClass } from '@/lib/services/classes'
import { enrolStudent, removeStudent } from '@/lib/services/enrollments'
import { addTutor, removeTutor } from '@/lib/services/classTeachers'

const refresh = () => revalidatePath('/classroom', 'layout')

/** Create a class (admin-only — admins own the class lifecycle; tutors run day-to-day). */
export async function createClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = createClassSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!parsed.success) return
  const course = await createClass(me, parsed.data.name)
  redirect(`/classroom/${course.id}`)
}

// Whole-class management (rename, archive/restore, co-tutor add/remove) is
// ADMIN-ONLY — a single tutor shouldn't be able to rename/hide a shared class or
// change its teaching staff. Day-to-day student enrolment (below) stays with tutors.
// Permission check + audit for every mutation below now happen inside the
// relevant service — not swallowed to a no-op here.

export async function renameClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  const parsed = createClassSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!id || !parsed.success) return
  await renameClass(me, id, parsed.data.name)
  refresh()
}

export async function archiveClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await archiveClass(me, id)
  refresh()
}

export async function restoreClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await restoreClass(me, id)
  refresh()
}

export async function addTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const classId = String(formData.get('class_id') ?? '')
  const teacherId = String(formData.get('teacher_id') ?? '')
  if (!classId || !teacherId) return
  await addTutor(me, { classId, teacherId })
  refresh()
}

export async function removeTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const classId = String(formData.get('class_id') ?? '')
  const teacherId = String(formData.get('teacher_id') ?? '')
  if (!classId || !teacherId) return
  await removeTutor(me, { classId, teacherId })
  refresh()
}

export async function enrolStudentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const studentId = String(formData.get('student_id') ?? '')
  if (!classId || !studentId) return
  await enrolStudent(me, { classId, studentId })
  refresh()
}

export async function removeStudentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const studentId = String(formData.get('student_id') ?? '')
  if (!classId || !studentId) return
  await removeStudent(me, { classId, studentId })
  refresh()
}
