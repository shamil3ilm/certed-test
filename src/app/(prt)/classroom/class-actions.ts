'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole, requireCapability } from '@/lib/auth/require-role'
import {
  createClassFromActionInput,
  archiveClassFromActionInput,
  restoreClassFromActionInput,
  renameClassFromActionInput,
} from '@/lib/services/classes'
import { enrolStudentFromActionInput, removeStudentFromActionInput } from '@/lib/services/enrollments'
import { addTutorFromActionInput, removeTutorFromActionInput } from '@/lib/services/class-tutors'

const refresh = () => revalidatePath('/classroom', 'layout')

// DELIBERATE role guard, not capability drift: the class *lifecycle* below is an
// admin-tier structural rule, and each underlying service already enforces
// requireAdminPersona + audit. Capability overrides reach only the entry guards
// and nav (not the service layer), so gating these on a capability would let an
// override pass the action while the service still denied it. Keep them role-based
// until service-layer capability resolution exists (then a `manageClasses`
// capability could make class administration override-grantable). Day-to-day
// enrolment (bottom) is capability-based because its service is not admin-only.

/** Create a class (admin-only - admins own the class lifecycle; tutors run day-to-day). */
export async function createClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  const course = await createClassFromActionInput(me, { name: formData.get('name') })
  redirect(`/classroom/${course.id}`)
}

// Whole-class management (rename, archive/restore, co-tutor add/remove) is
// ADMIN-ONLY - a single tutor shouldn't be able to rename/hide a shared class or
// change its teaching staff. Day-to-day student enrolment (below) stays with tutors.
// Permission check + audit for every mutation below now happen inside the
// relevant service - not swallowed to a no-op here.

export async function renameClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  await renameClassFromActionInput(me, {
    id: formData.get('id'),
    name: formData.get('name'),
  })
  refresh()
}

export async function archiveClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  await archiveClassFromActionInput(me, { id: formData.get('id') })
  refresh()
}

export async function restoreClassAction(formData: FormData) {
  const me = await requireRole(['admin'])
  await restoreClassFromActionInput(me, { id: formData.get('id') })
  refresh()
}

export async function addTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  await addTutorFromActionInput(me, {
    class_id: formData.get('class_id'),
    tutor_id: formData.get('tutor_id'),
  })
  refresh()
}

export async function removeTutorAction(formData: FormData) {
  const me = await requireRole(['admin'])
  await removeTutorFromActionInput(me, {
    class_id: formData.get('class_id'),
    tutor_id: formData.get('tutor_id'),
  })
  refresh()
}

export async function enrolStudentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await enrolStudentFromActionInput(me, {
    class_id: formData.get('class_id'),
    student_id: formData.get('student_id'),
  })
  refresh()
}

export async function removeStudentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  await removeStudentFromActionInput(me, {
    class_id: formData.get('class_id'),
    student_id: formData.get('student_id'),
  })
  refresh()
}
