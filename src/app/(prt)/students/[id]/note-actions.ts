'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import { addMenteeNote } from '@/lib/services/mentee-notes'

/** Add a pastoral note to a mentee. viewMentees opens the page; the actual gate is
 *  canMentor inside the service (the student's mentor or an admin). A service error
 *  (not allowed, empty note) redirects back with ?error=1 rather than crashing. */
export async function addMenteeNoteAction(formData: FormData) {
  const me = await requireCapability('viewMentees')
  const studentId = String(formData.get('student_id') ?? '')
  try {
    await addMenteeNote(me, studentId, formData.get('body'))
  } catch (error) {
    if (error instanceof ServiceError) redirect(`/students/${studentId}?error=1`)
    throw error
  }
  revalidatePath(`/students/${studentId}`)
}
