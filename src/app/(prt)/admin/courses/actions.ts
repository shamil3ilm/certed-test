'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import {
  createCourseSchema,
  enrollmentSchema,
  teacherAssignmentSchema,
} from '@/lib/validation/course'
import { createCourse, setCourseStatus } from '@/lib/repos/courses'
import { enroll } from '@/lib/repos/enrollments'
import { assignTeacher } from '@/lib/repos/courseTeachers'
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
  await requireRole(['admin'])
  const parsed = enrollmentSchema.safeParse({
    student_id: String(formData.get('student_id') ?? ''),
    course_id: String(formData.get('course_id') ?? ''),
  })
  if (!parsed.success) return
  await enroll(parsed.data.student_id, parsed.data.course_id)
  revalidatePath('/admin/courses')
}

export async function assignTeacherAction(formData: FormData) {
  await requireRole(['admin'])
  const parsed = teacherAssignmentSchema.safeParse({
    teacher_id: String(formData.get('teacher_id') ?? ''),
    course_id: String(formData.get('course_id') ?? ''),
  })
  if (!parsed.success) return
  await assignTeacher(parsed.data.teacher_id, parsed.data.course_id)
  revalidatePath('/admin/courses')
}
