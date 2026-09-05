'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import {
  createAnnouncementFromActionInput,
  archiveAnnouncement,
  restoreAnnouncement,
  editAnnouncementFromActionInput,
} from '@/lib/services/announcements'
import { classErrorUrl } from '../action-redirect'

/**
 * These run as native `<form action>` submissions (so SubmitButton's
 * useFormStatus pending state keeps working). A service-thrown
 * ValidationError/PermissionError/NotFoundError - e.g. a message over the length
 * limit, or an archive/restore of a row deleted in a concurrent session - would
 * otherwise crash the Server Action into Next's generic error page. Instead we
 * redirect back to the class stream with `?error=announcement`, which the page
 * renders as an inline banner. The originating class id travels in a hidden
 * `stream_class_id` field so archive/restore (which only carry the post id) know
 * where to return. redirect() throws NEXT_REDIRECT, so it stays outside catch.
 */
const announcementErrorUrl = (formData: FormData) =>
  classErrorUrl(formData, { fields: ['stream_class_id'], error: 'announcement' })

export async function createAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await createAnnouncementFromActionInput(me, {
      class_id: formData.get('class_id'),
      title: formData.get('title'),
      message: formData.get('message'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(announcementErrorUrl(formData))
    throw error
  }
  revalidatePath('/(prt)/classroom', 'layout')
}

export async function createAnnouncementStatusAction(formData: FormData): Promise<ActionStatusResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createAnnouncementFromActionInput(me, {
      class_id: formData.get('class_id'),
      title: formData.get('title'),
      message: formData.get('message'),
    })
    revalidatePath('/(prt)/classroom', 'layout')
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}

export async function archiveAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  try {
    await archiveAnnouncement(me, id)
  } catch (error) {
    if (error instanceof ServiceError) redirect(announcementErrorUrl(formData))
    throw error
  }
  revalidatePath('/(prt)/classroom', 'layout')
}

export async function restoreAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  try {
    await restoreAnnouncement(me, id)
  } catch (error) {
    if (error instanceof ServiceError) redirect(announcementErrorUrl(formData))
    throw error
  }
  revalidatePath('/(prt)/classroom', 'layout')
}

export async function editAnnouncementAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  try {
    await editAnnouncementFromActionInput(me, {
      id: formData.get('id'),
      title: formData.get('title'),
      message: formData.get('message'),
    })
  } catch (error) {
    if (error instanceof ServiceError) redirect(announcementErrorUrl(formData))
    throw error
  }
  revalidatePath('/(prt)/classroom', 'layout')
}
