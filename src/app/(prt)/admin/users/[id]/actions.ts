'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import { createOrReuseSubject } from '@/lib/services/subjects'
import { addSubjectToStudent } from '@/lib/services/class-subjects'
import { addTutorFromActionInput, removeTutorFromActionInput } from '@/lib/services/class-tutors'
import { archiveClassFromActionInput } from '@/lib/services/classes/lifecycle'
import { editUserFromActionInput } from '@/lib/services/users'

/** Assignment + detail edits for one user, from /admin/users/[id]. A service error
 *  (bad id, inactive target, archived class) redirects back with ?error=1 rather
 *  than crashing into the portal error boundary; redirect() throws, so it stays
 *  outside the catch. */
const errorUrl = (id: string) => `/admin/users/${id}?error=1`

/** Add a subject to a student = create their class for that subject + assign the
 *  tutor. The subject field is free-typed against a datalist, so create-or-reuse
 *  resolves a typed-new subject into the master list (no duplicate on "maths"). */
export async function addSubjectAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    const subject = await createOrReuseSubject(me, { name: formData.get('subject') })
    await addSubjectToStudent(me, {
      studentId,
      subjectId: subject.id,
      tutorId: String(formData.get('tutor_id') ?? '').trim() || undefined,
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

/** Add a tutor to a student's subject (its 1:1 class). A subject may have several
 *  tutors, so this ADDS one without touching the others. manageClasses-gated. */
export async function addSubjectTutorAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await addTutorFromActionInput(me, { class_id: formData.get('class_id'), tutor_id: formData.get('tutor_id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

/** Remove ONE tutor from a student's subject, leaving any co-tutors in place. */
export async function removeSubjectTutorAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await removeTutorFromActionInput(me, { class_id: formData.get('class_id'), tutor_id: formData.get('tutor_id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

/** Remove a subject from a student = archive that 1:1 class (soft delete). */
export async function removeSubjectAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await archiveClassFromActionInput(me, { id: formData.get('class_id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(studentId))
    throw error
  }
  revalidatePath(`/admin/users/${studentId}`)
}

/** Edit the admin-owned detail fields (name, class, country, phone, guardian,
 *  joined date). Role is never editable here - personas are fixed identities. */
export async function editDetailsAction(formData: FormData) {
  const me = await requireCapability('manageUsers')
  const id = String(formData.get('id') ?? '')
  try {
    await editUserFromActionInput(me, {
      id: formData.get('id'),
      full_name: formData.get('full_name'),
      class_level: formData.get('class_level'),
      country: formData.get('country'),
      phone: formData.get('phone'),
      guardian_name: formData.get('guardian_name'),
      guardian_phone: formData.get('guardian_phone'),
      joined_on: formData.get('joined_on'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(errorUrl(id))
    throw error
  }
  revalidatePath(`/admin/users/${id}`)
}
