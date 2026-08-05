import { z } from 'zod'

const roleSchema = z.enum(['admin', 'sub_admin', 'tutor', 'mentor', 'student'])

/**
 * Password policy: at least 8 characters with an uppercase
 * letter, a lowercase letter, a number, and a special character. Breach-corpus
 * checking (the realistic defence against reused/leaked passwords) is delegated
 * to Supabase Auth's leaked-password protection, enabled in the project's Auth
 * settings. We also reject a password built from the account's own email name.
 */
const MIN_PASSWORD_LENGTH = 8
const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200)
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a special character')

/** True when `password` does not contain the local part of `email` (e.g. an
 *  "aisha@..." account may not use "aisha1234"). Skips very short local parts,
 *  which would over-match. */
export function passwordAvoidsEmail(password: string, email: string): boolean {
  const local = email.split('@')[0]?.trim().toLowerCase()
  if (!local || local.length < 3) return true
  return !password.toLowerCase().includes(local)
}

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
 * Users hub. Any future reassignment flow must be a separate, audited admin
 * operation that reconciles class memberships, mentorships, scoped personas,
 * and finance expectations.
 */
export const editUserSchema = z.object({
  full_name: z.string().max(120).nullable().optional(),
  class_level: z.string().max(20).nullable().optional(),
})
export type EditUserInput = z.infer<typeof editUserSchema>

/** Self-registration: allowlisted email + admin-issued setup code + new password. */
export const registerSchema = z
  .object({
    email: z.string().email(),
    code: z.string().trim().min(1).max(40),
    password: passwordField,
  })
  .refine((v) => passwordAvoidsEmail(v.password, v.email), {
    message: 'Password must not contain your email name',
    path: ['password'],
  })
export type RegisterInput = z.infer<typeof registerSchema>

/** Self-service profile edit (settings page): name only - class/grade is admin-controlled. */
export const updateProfileSchema = z.object({
  full_name: z.string().trim().max(120).optional(),
})

/** Self-service email change - the new sign-in email. */
export const changeEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
})

/** Self-service password change - same length floor as registerSchema's password. */
export const changePasswordSchema = z
  .object({
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
