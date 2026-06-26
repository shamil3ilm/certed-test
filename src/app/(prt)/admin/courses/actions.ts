'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import {
  createCourseSchema,
  enrollmentSchema,
  teacherAssignmentSchema,
} from '@/lib/validation/course'
import { createCourse, setCourseStatus, renameCourse } from '@/lib/repos/courses'
import { enroll, unenroll } from '@/lib/repos/enrollments'
import { assignTeacher, unassignTeacher } from '@/lib/repos/courseTeachers'
import { writeAudit } from '@/lib/repos/audit'

export async function createCourseAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = createCourseSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!parsed.success) return
  const course = await createCourse(parsed.data.name)
  await writeAudit({ actor_id: me.id, action: 'course.create', entity_type: 'course', entity_id: course.id })
  revalidatePath('/admin/courses')
}

export async function archiveCourseAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setCourseStatus(id, 'archived')
  await writeAudit({ actor_id: me.id, action: 'course.archive', entity_type: 'course', entity_id: id })
  revalidatePath('/admin/courses')
}

export async function enrollAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = enrollmentSchema.safeParse({
    student_id: String(formData.get('student_id') ?? ''),
    course_id: String(formData.get('course_id') ?? ''),
  })
  if (!parsed.success) return
  await enroll(parsed.data.student_id, parsed.data.course_id)
  await writeAudit({ actor_id: me.id, action: 'course.enroll', entity_type: 'enrollment', entity_id: parsed.data.course_id })
  revalidatePath('/admin/courses')
}

export async function assignTeacherAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const parsed = teacherAssignmentSchema.safeParse({
    teacher_id: String(formData.get('teacher_id') ?? ''),
    course_id: String(formData.get('course_id') ?? ''),
  })
  if (!parsed.success) return
  await assignTeacher(parsed.data.teacher_id, parsed.data.course_id)
  await writeAudit({ actor_id: me.id, action: 'course.assign_teacher', entity_type: 'course_teacher', entity_id: parsed.data.course_id })
  revalidatePath('/admin/courses')
}

export async function renameCourseAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  const parsed = createCourseSchema.safeParse({ name: String(formData.get('name') ?? '') })
  if (!id || !parsed.success) return
  await renameCourse(id, parsed.data.name)
  await writeAudit({ actor_id: me.id, action: 'course.rename', entity_type: 'course', entity_id: id })
  revalidatePath('/admin/courses')
}

export async function restoreCourseAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await setCourseStatus(id, 'active')
  await writeAudit({ actor_id: me.id, action: 'course.restore', entity_type: 'course', entity_id: id })
  revalidatePath('/admin/courses')
}

export async function unassignTeacherAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '') // course_teachers row id
  if (!id) return
  await unassignTeacher(id)
  await writeAudit({ actor_id: me.id, action: 'course.unassign_teacher', entity_type: 'course_teacher', entity_id: id })
  revalidatePath('/admin/courses')
}

export async function unenrollAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const id = String(formData.get('id') ?? '') // enrollments row id
  if (!id) return
  await unenroll(id)
  await writeAudit({ actor_id: me.id, action: 'course.unenroll', entity_type: 'enrollment', entity_id: id })
  revalidatePath('/admin/courses')
}
