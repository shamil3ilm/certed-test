import { z } from 'zod'

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  // The client always sends new Date(input).toISOString(); a direct/forged
  // server-action POST could send anything, so require real ISO-8601 here.
  remind_at: z.string().datetime(),
})
export type CreateReminderInput = z.infer<typeof createReminderSchema>
