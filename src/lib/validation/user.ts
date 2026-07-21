import { z } from 'zod'

export const roleSchema = z.enum(['admin', 'sub_admin', 'tutor', 'mentor', 'student'])

/** Roles a Sub Admin is allowed to create/assign - tutor/student only. Mentor
 *  accounts (like the admin tier) are created and managed by a full admin. */
export const subAdminAssignableRoles = ['tutor', 'student'] as const

export const addUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120).optional(),
  role: roleSchema,
  class_level: z.string().max(20).optional(),
})
export type AddUserInput = z.infer<typeof addUserSchema>

/**
 * Editing a user updates profile details only - never their role. Personas are
 * fixed identities (a student is not converted into staff, nor staff into a
 * student), so role reassignment is deliberately excluded from the everyday
 * Users hub. If reassignment is ever required it must be a separate, audited
 * admin-only migration that also reconciles class memberships, mentorships,
 * scoped personas, and finance expectations.
 */
export const editUserSchema = z.object({
  full_name: z.string().max(120).nullable().optional(),
  class_level: z.string().max(20).nullable().optional(),
})
export type EditUserInput = z.infer<typeof editUserSchema>

/** Self-registration: allowlisted email + admin-issued setup code + new password. */
export const registerSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(1).max(40),
  password: z.string().min(8).max(200),
})
export type RegisterInput = z.infer<typeof registerSchema>

/** Self-service profile edit (settings page): name only - class/grade is admin-controlled. */
export const updateProfileSchema = z.object({
  full_name: z.string().trim().max(120).optional(),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/** Self-service password change - same bounds as registerSchema's password. */
export const changePasswordSchema = z
  .object({
    password: z.string().min(8).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
