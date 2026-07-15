import { z } from 'zod'

export const commentEntityTypeSchema = z.enum(['submission', 'resource', 'meet'])

export const addCommentSchema = z.object({
  entity_type: commentEntityTypeSchema,
  entity_id: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
})
export type AddCommentInput = z.infer<typeof addCommentSchema>
