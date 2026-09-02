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

/** Optional trimmed free text with a length cap - the person-detail fields. */
const optText = (max: number) => z.string().trim().max(max).optional()
/** A calendar date as YYYY-MM-DD, or absent. */
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .optional()

/**
 * Adding a user captures identity + the details an admin/sub-admin owns. Country
 * and class/grade are required for students (a student must be reachable and placed);
 * everything else is optional here and can be self-completed at first sign-in. Role
 * decides which fields the form shows - the schema only enforces the student minimums.
 */
export const addUserSchema = z
  .object({
    email: z.string().email(),
    full_name: z.string().min(1).max(120).optional(),
    role: roleSchema,
    class_level: optText(40), // grade, e.g. "Grade 10"
    country: optText(60),
    phone: optText(30),
    guardian_name: optText(120),
    guardian_phone: optText(30),
    joined_on: optDate,
  })
  .superRefine((v, ctx) => {
    if (v.role !== 'student') return
    if (!v.country?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['country'], message: 'Country is required for students' })
    }
    if (!v.class_level?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['class_level'],
        message: 'Class / grade is required for students',
      })
    }
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
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const editUserSchema = z.object({
  full_name: z.string().max(120).nullable().optional(),
  class_level: nullableText(40),
  country: nullableText(60),
  phone: nullableText(30),
  guardian_name: nullableText(120),
  guardian_phone: nullableText(30),
  joined_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
    .nullable()
    .optional(),
})
export type EditUserInput = z.infer<typeof editUserSchema>

/** Self-registration: allowlisted email + admin-issued setup code + new password. */
export const registerSchema = z
  .object({
    email: z.string().email(),
    code: z.string().trim().min(1).max(40),
    password: passwordField,
    /** Attestation that a parent/guardian consents - required server-side only when the
     *  registering profile is a minor (a student with a guardian on record / under 18). */
    guardian_consent: z.boolean().default(false),
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

/**
 * The softer profile fields a person completes themselves at first sign-in
 * (settings). Identity, class/grade, country and guardian stay admin-owned; these
 * are the person's own to fill. All optional - an empty field just clears it.
 */
export const selfProfileDetailsSchema = z.object({
  phone: optText(30),
  date_of_birth: optDate,
  qualifications: z.string().trim().max(300).optional(),
  bio: z.string().trim().max(500).optional(),
})
export type SelfProfileDetailsInput = z.infer<typeof selfProfileDetailsSchema>

/** Self-service email change - the new sign-in email. */
export const changeEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // Re-authentication: the current password must be supplied to change the login email.
  current_password: z.string().min(1, 'Enter your current password.'),
})

/** Self-service password change - same length floor as registerSchema's password. */
export const changePasswordSchema = z
  .object({
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
