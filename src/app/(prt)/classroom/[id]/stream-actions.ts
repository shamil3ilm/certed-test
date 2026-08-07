'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import { createAnnouncementFromActionInput } from '@/lib/services/announcements'
import { createMeetLinkFromActionInput } from '@/lib/services/meet-links'
import { classErrorUrl, classSavedUrl } from '../../action-redirect'

/**
 * One composer, two destinations. A stream post carrying a meeting URL becomes a
 * meet (join link + its own Q&A thread); without one it is a plain announcement.
 * No schema change - we just route to the matching service. The message doubles
 * as the meeting description. Scheduling is intentionally left off this form: a
 * `datetime-local` value has no timezone, and converting it correctly needs the
 * browser - so a composed meeting is an always-available link, and its time is
 * set afterward through the meet card's (client-side) Edit. As with the plain
 * announcement action, a ServiceError redirects back with an inline banner
 * rather than crashing the Server Action.
 */
export async function createStreamPostAction(formData: FormData) {
  const me = await requireCapability('manageClassContent')
  const url = String(formData.get('url') ?? '').trim()
  try {
    if (url) {
      await createMeetLinkFromActionInput(me, {
        classId: formData.get('class_id'),
        title: formData.get('title'),
        url,
        description: formData.get('message'),
        scheduled_at: '',
      })
    } else {
      await createAnnouncementFromActionInput(me, {
        class_id: formData.get('class_id'),
        title: formData.get('title'),
        message: formData.get('message'),
        attachments: formData.get('attachments'),
        publish_at: formData.get('publish_at'),
        expires_at: formData.get('expires_at'),
      })
    }
  } catch (error) {
    if (error instanceof ServiceError) redirect(classErrorUrl(formData, { fields: ['stream_class_id'], error: 'post' }))
    throw error
  }
  revalidatePath('/classroom', 'layout')
  redirect(classSavedUrl(formData, { fields: ['stream_class_id'], saved: 'post' }))
}
