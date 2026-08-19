import 'server-only'
import { z } from 'zod'
import type { Profile } from '@/lib/auth/profile'
import { updateOrgProfile, type OrgProfilePatch } from '@/lib/data/org-settings'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'

/** Validation + write for the admin Organization settings form. Auth is enforced
 *  by the action (admin capability); the columns already exist, so there is no
 *  schema surface here - just validated updates to the single org_settings row. */

// Inputs arrive as strings from the form; an empty string becomes null.
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

const orgProfileSchema = z.object({
  institute_name: z.string().trim().min(1, 'Institute name is required').max(200),
  contact_email: optional(200).refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'Enter a valid contact email',
  ),
  contact_phone: optional(50),
  bank_account: optional(100),
  bank_ifsc: optional(50),
  bank_branch: optional(120),
  terms_text: optional(2000),
  signatory_name: optional(120),
  signatory_title: optional(120),
  signature_text: optional(120),
  receipt_prefix: z.string().trim().min(1, 'Receipt prefix is required').max(20),
  payslip_prefix: z.string().trim().min(1, 'Pay slip prefix is required').max(20),
})

export function validateOrgProfileInput(input: unknown): OrgProfilePatch {
  const parsed = orgProfileSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid organization settings')
  }
  return parsed.data
}

export async function saveOrgProfile(actor: Profile, patch: OrgProfilePatch): Promise<void> {
  await updateOrgProfile(patch)
  await auditPrivilegedAction(actor, 'org.settings_update', 'org_settings', 'org_settings')
}
