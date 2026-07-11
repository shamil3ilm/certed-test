import { z } from 'zod'
import { linkUrl } from '@/lib/validation/url'

export const submissionInputSchema = z.object({
  assignment_id: z.string().uuid(),
  url: linkUrl,
  file_name: z.string().trim().max(255).optional(),
})

export type SubmissionInput = z.infer<typeof submissionInputSchema>
