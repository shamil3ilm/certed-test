import 'server-only'
import { z } from 'zod'
import type { Profile } from '@/lib/auth/profile'
import { ValidationError } from '@/lib/errors'
import { validateUuidField } from '@/lib/validation/id'
import { requireManageableTarget } from '@/lib/services/users/admin-lifecycle'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import {
  clearPrimaryForStudent,
  deleteGuardian,
  insertGuardian,
  selectGuardiansByStudent,
  setGuardianPrimary,
  type GuardianRow,
} from '@/lib/data/guardians'

/**
 * A student's parent/guardian contacts. Guardians are admin-owned detail (like the
 * other profile fields the DB restricts): every mutation first re-checks the actor's
 * tier against the student via requireManageableTarget, so a sub_admin can manage a
 * student's guardians but never reach outside their remit. Guardians attach to a
 * STUDENT only (a minor's consent + contact record).
 */

const guardianSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40),
  email: z.string().trim().email().max(200).or(z.literal('')),
  relationship: z.string().trim().max(40),
  is_primary: z.boolean(),
})

/** A student's guardians (minors' PII). Actor-gated on the same tier rule as the
 *  mutations, so a service-role read can't be reached without proving remit - not left
 *  to rely on the caller alone. */
export async function listGuardians(actor: Profile, studentId: string): Promise<GuardianRow[]> {
  await requireManageableTarget(actor, studentId)
  return selectGuardiansByStudent(studentId)
}

export async function addGuardian(actor: Profile, studentId: string, raw: unknown): Promise<void> {
  const target = await requireManageableTarget(actor, studentId)
  if (target.role !== 'student') throw new ValidationError('Guardians can only be added to a student.')

  const parsed = guardianSchema.safeParse(raw)
  if (!parsed.success) throw new ValidationError('Enter a guardian name (and a valid email, if you add one).')
  const g = parsed.data

  // Only one primary per student: clear the others before marking this one.
  if (g.is_primary) await clearPrimaryForStudent(studentId)
  const guardianId = await insertGuardian({
    student_id: studentId,
    name: g.name,
    phone: g.phone || null,
    email: g.email || null,
    relationship: g.relationship || null,
    is_primary: g.is_primary,
  })
  await auditGuardianChange(actor, 'guardian.add', guardianId, studentId)
}

export async function removeGuardian(actor: Profile, studentId: string, guardianId: string): Promise<void> {
  await requireManageableTarget(actor, studentId)
  const id = validateUuidField(guardianId, 'Invalid guardian id.')
  await deleteGuardian(id, studentId)
  await auditGuardianChange(actor, 'guardian.remove', id, studentId)
}

export async function makeGuardianPrimary(actor: Profile, studentId: string, guardianId: string): Promise<void> {
  await requireManageableTarget(actor, studentId)
  const id = validateUuidField(guardianId, 'Invalid guardian id.')
  await clearPrimaryForStudent(studentId)
  await setGuardianPrimary(id, studentId)
  await auditGuardianChange(actor, 'guardian.make_primary', id, studentId)
}

/**
 * Records WHO changed WHICH guardian record, and for which student - and nothing
 * else. Guardian rows are a minor's contact PII, so the name/phone/email are
 * deliberately NOT copied into the audit table: the point of the trail is
 * accountability for the change, and duplicating the PII into a second table
 * would widen its footprint for no added accountability.
 *
 * Every other privileged service audits its writes; guardians did not, which left
 * the one surface holding minors' contact details with no record of who touched it.
 */
async function auditGuardianChange(
  actor: Profile,
  action: 'guardian.add' | 'guardian.remove' | 'guardian.make_primary',
  guardianId: string,
  studentId: string,
): Promise<void> {
  await auditPrivilegedAction(actor, action, 'guardian', guardianId, { student_id: studentId })
}

export type { GuardianRow } from '@/lib/data/guardians'
