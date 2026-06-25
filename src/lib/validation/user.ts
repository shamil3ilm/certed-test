import { z } from 'zod'

export const roleSchema = z.enum(['admin', 'teacher', 'student'])
export type Role = z.infer<typeof roleSchema>

export const addUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120).optional(),
  role: roleSchema,
  class_level: z.string().max(20).optional(),
})
export type AddUserInput = z.infer<typeof addUserSchema>
