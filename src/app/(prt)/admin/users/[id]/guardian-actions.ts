'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import { addGuardian, makeGuardianPrimary, removeGuardian } from '@/lib/services/guardians'

/** Guardian-contact edits for one student, from /admin/users/[id]. A service error
 *  (bad id, non-manageable target, invalid input) redirects back with ?error=1 rather
 *  than crashing the portal error boundary; redirect() throws, so it stays outside the
 *  catch. Gated on manageUsers at transport; the service re-checks the tier per student. */
const errorUrl = (id: string) => `/admin/users/${id}?error=1`

export async function addGuardianAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await addGuardian(me, studentId, {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      relationship: formData.get('relationship'),
      is_primary: formData.get('is_primary') === 'on',
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

export async function removeGuardianAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await removeGuardian(me, studentId, String(formData.get('guardian_id') ?? ''))
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

export async function makeGuardianPrimaryAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await makeGuardianPrimary(me, studentId, String(formData.get('guardian_id') ?? ''))
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}
