import 'server-only'
import { z } from 'zod'
import type { Profile } from '@/lib/auth/profile'
import { ValidationError } from '@/lib/errors'
import { requireManageableTarget } from '@/lib/services/users/admin-lifecycle'
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

export async function listGuardians(studentId: string): Promise<GuardianRow[]> {
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
  await insertGuardian({
    student_id: studentId,
    name: g.name,
    phone: g.phone || null,
    email: g.email || null,
    relationship: g.relationship || null,
    is_primary: g.is_primary,
  })
}

export async function removeGuardian(actor: Profile, studentId: string, guardianId: string): Promise<void> {
  await requireManageableTarget(actor, studentId)
  await deleteGuardian(guardianId, studentId)
}

export async function makeGuardianPrimary(actor: Profile, studentId: string, guardianId: string): Promise<void> {
  await requireManageableTarget(actor, studentId)
  await clearPrimaryForStudent(studentId)
  await setGuardianPrimary(guardianId, studentId)
}
