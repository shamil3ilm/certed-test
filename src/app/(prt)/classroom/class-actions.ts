'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import {
  archiveClassFromActionInput,
  restoreClassFromActionInput,
  renameClassFromActionInput,
} from '@/lib/services/classes'
import { enrolStudentFromActionInput, removeStudentFromActionInput } from '@/lib/services/enrollments'
import { addTutorFromActionInput, removeTutorFromActionInput } from '@/lib/services/class-tutors'
import { classErrorUrl } from '../action-redirect'

const refresh = () => revalidatePath('/classroom', 'layout')

// These are native `<form action>` submissions on /classroom/[id]/people, so a
// reachable service error (rename to a duplicate name, enrol a student already at
// capacity, add a tutor twice) would otherwise crash the Server Action into Next's
// generic error page. Surface it instead as an inline banner by redirecting back
// to the people page with `?error=1`. The class id is already in the form - as
// `class_id` (enrol/tutor) or `id` (rename/archive/restore). This SURFACES the
// error rather than swallowing it to a no-op, matching the service's fail-loud
// intent. redirect() throws NEXT_REDIRECT, so it must stay outside the catch.
const peopleErrorUrl = (formData: FormData) => classErrorUrl(formData, { sub: 'people' })

// Whole-class lifecycle + teaching staff are gated on the manageClasses capability
// (admin and sub_admin by default; override-grantable). Both this action guard AND
// the underlying services resolve the capability WITH overrides (requireCapability
// here, requireActorCapability in the service), so the two can't disagree. Day-to-day
// enrolment (bottom) uses manageClassContent because its service is not class-admin-only.

// A class is created only as a student's SUBJECT (services/class-subjects →
// addSubjectToStudent), so there is no standalone create action here - classes always
// carry a subject_id. Lifecycle below is rename / archive / restore / staffing.

// Whole-class management (rename, archive/restore, co-tutor add/remove) requires
// manageClasses - a single tutor shouldn't be able to rename/hide a shared class or
// change its teaching staff. Day-to-day student enrolment (below) stays with tutors.
// These actions stay transport-thin: permission, validation, and audit live in
// the domain services, and ServiceError is surfaced back onto the people page.

export async function renameClassAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  try {
    await renameClassFromActionInput(me, {
      id: formData.get('id'),
      name: formData.get('name'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function archiveClassAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  try {
    await archiveClassFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function restoreClassAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  try {
    await restoreClassFromActionInput(me, { id: formData.get('id') })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function addTutorAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  try {
    await addTutorFromActionInput(me, {
      class_id: formData.get('class_id'),
      tutor_id: formData.get('tutor_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function removeTutorAction(formData: FormData) {
  const me = await requireCapability('manageClasses')
  try {
    await removeTutorFromActionInput(me, {
      class_id: formData.get('class_id'),
      tutor_id: formData.get('tutor_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function enrolStudentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await enrolStudentFromActionInput(me, {
      class_id: formData.get('class_id'),
      student_id: formData.get('student_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}

export async function removeStudentAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await removeStudentFromActionInput(me, {
      class_id: formData.get('class_id'),
      student_id: formData.get('student_id'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(peopleErrorUrl(formData))
    throw error
  }
  refresh()
}
