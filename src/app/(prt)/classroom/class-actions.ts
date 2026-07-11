'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { createClassSchema } from '@/lib/validation/class'
import { createClass, setClassStatus, renameClass } from '@/lib/repos/classes'
import { enroll, unenroll } from '@/lib/repos/enrollments'
import { assignTeacher, unassignTeacher } from '@/lib/repos/classTeachers'
import { canManageClass } from '@/lib/repos/classes'
import { writeAudit } from '@/lib/repos/audit'

const refresh = () => revalidatePath('/classroom', 'layout')

/** Create a class (admin-only — admins own the class lifecycle; tutors run day-to-day). */
export async function createClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = createClassSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!parsed.success) return
  const course = await createClass(parsed.data.name)
  await writeAudit({ actor_id: me.id, action: 'class.create', entity_type: 'class', entity_id: course.id })
  redirect(`/classroom/${course.id}`)
}

// Whole-class management (rename, archive/restore, co-tutor add/remove) is
// ADMIN-ONLY — a single tutor shouldn't be able to rename/hide a shared class or
// change its teaching staff. Day-to-day student enrolment (below) stays with tutors.

export async function renameClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  const parsed = createClassSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!id || !parsed.success) return
  await renameClass(id, parsed.data.name)
  await writeAudit({ actor_id: me.id, action: 'class.rename', entity_type: 'class', entity_id: id })
  refresh()
}

export async function archiveClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setClassStatus(id, 'archived')
  await writeAudit({ actor_id: me.id, action: 'class.archive', entity_type: 'class', entity_id: id })
  refresh()
}

export async function restoreClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setClassStatus(id, 'active')
  await writeAudit({ actor_id: me.id, action: 'class.restore', entity_type: 'class', entity_id: id })
  refresh()
}

export async function addTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const classId = String(formData.get('class_id') ?? '')
  const teacherId = String(formData.get('teacher_id') ?? '')
  if (!classId || !teacherId) return
  await assignTeacher(teacherId, classId)
  await writeAudit({ actor_id: me.id, action: 'class.assign_teacher', entity_type: 'class_teacher', entity_id: classId })
  refresh()
}

export async function removeTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const classId = String(formData.get('class_id') ?? '')
  const teacherId = String(formData.get('teacher_id') ?? '')
  if (!classId || !teacherId) return
  await unassignTeacher(classId, teacherId)
  await writeAudit({ actor_id: me.id, action: 'class.unassign_teacher', entity_type: 'class_teacher', entity_id: classId })
  refresh()
}

export async function enrolStudentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const studentId = String(formData.get('student_id') ?? '')
  if (!classId || !studentId || !(await canManageClass(me, classId))) return
  await enroll(studentId, classId)
  await writeAudit({ actor_id: me.id, action: 'class.enroll', entity_type: 'enrollment', entity_id: classId })
  refresh()
}

export async function removeStudentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const classId = String(formData.get('class_id') ?? '')
  const studentId = String(formData.get('student_id') ?? '')
  if (!classId || !studentId || !(await canManageClass(me, classId))) return
  await unenroll(classId, studentId)
  await writeAudit({ actor_id: me.id, action: 'class.unenroll', entity_type: 'enrollment', entity_id: classId })
  refresh()
}
