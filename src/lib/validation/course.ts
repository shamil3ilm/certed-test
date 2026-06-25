import { z } from 'zod'

export const createCourseSchema = z.object({
  name: z.string().min(1).max(120),
})
export type CreateCourseInput = z.infer<typeof createCourseSchema>

export const enrollmentSchema = z.object({
  student_id: z.string().uuid(),
  course_id: z.string().uuid(),
})
export type EnrollmentInput = z.infer<typeof enrollmentSchema>

export const teacherAssignmentSchema = z.object({
  teacher_id: z.string().uuid(),
  course_id: z.string().uuid(),
})
export type TeacherAssignmentInput = z.infer<typeof teacherAssignmentSchema>
