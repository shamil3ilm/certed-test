import { ValidationError } from '@/lib/errors'
import { z } from 'zod'

/** Raw form values -> trusted inputs. Pure: no IO, no authorization. */

export type MentorshipParams = { mentorId: string; studentId: string }
const mentorshipIdSchema = z.string().uuid()
const mentorshipParamsSchema = z.object({
  mentorId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export type AssignMentorActionInput = {
  mentor_id?: FormDataEntryValue | null
  student_id?: FormDataEntryValue | null
}

export type RemoveMentorActionInput = {
  id?: FormDataEntryValue | null
}

export function validateAssignMentorInput(input: AssignMentorActionInput): MentorshipParams {
  const parsed = mentorshipParamsSchema.safeParse({
    mentorId: String(input.mentor_id ?? ''),
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
