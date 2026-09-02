import { z } from 'zod'
import { titleField } from '@/lib/validation/fields'

export const createReminderSchema = z.object({
  title: titleField,
  description: z.string().trim().max(2000).optional(),
  // The client always sends new Date(input).toISOString(); a direct/forged
  // server-action POST could send anything, so require real ISO-8601 here.
  remind_at: z.string().datetime(),
})

export const editReminderSchema = createReminderSchema.extend({
  id: z.string().uuid(),
})

/** A reminder a tutor/mentor assigns ON a student: the reminder fields plus the
 *  assignee (student) and the class it belongs to. */
export const assignReminderSchema = createReminderSchema.extend({
  assigneeId: z.string().uuid(),
  classId: z.string().uuid(),
})
