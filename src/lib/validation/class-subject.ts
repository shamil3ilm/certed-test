import { z } from 'zod'

/**
 * Assigning a subject to a student = creating their 1:1 class for that subject, with
 * an optional tutor (assignable later). Pure schema so both the service and its unit
 * tests can import it without pulling the server-only class/enrolment chain.
 */
export const addSubjectSchema = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  tutorId: z.string().uuid().optional(),
})
export type AddSubjectInput = z.infer<typeof addSubjectSchema>
