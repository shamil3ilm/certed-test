import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '@/lib/drive/validate'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid datetime')

export const createAssignmentSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  due_date: isoDate, // absolute ISO instant (client converts its local input to UTC)
})
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>

export const submissionInitSchema = z.object({
  assignment_id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})
export type SubmissionInitInput = z.infer<typeof submissionInitSchema>

export const submissionFinalizeSchema = z.object({
  assignment_id: z.string().uuid(),
  drive_file_id: z.string().min(1).max(255),
})
export type SubmissionFinalizeInput = z.infer<typeof submissionFinalizeSchema>
