'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { ServiceError } from '@/lib/errors'
import { createAnnouncementFromActionInput } from '@/lib/services/announcements'
import { createMeetLinkFromActionInput } from '@/lib/services/meet-links'

/**
 * One composer, two destinations. A stream post carrying a meeting URL becomes a
 * meet (join link + its own Q&A thread); without one it is a plain announcement.
 * No schema change - we just route to the matching service; the message doubles as
 * the meeting description. Both branches return a plain result (not a redirect) so
 * the client composer can drive create-then-attach for files, plus its own toast +
 * refresh, uniformly across the two destinations.
 */

type PostResult = { ok: true } | { ok: false; error: string }

function postError(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof ServiceError ? error.message : fallback }
}

/**
 * Post an announcement and return its id, so the client composer can then upload
 * custodial files to it (create-then-attach, like submissions and documents). The
 * client needs the id to attach, and drives its own toast + refresh. Files are the
 * attachment path here - `attachments` (external links) is intentionally left off.
 */
export async function createAnnouncementReturningId(input: {
  classId: string
  title: string
  message: string
  publishAt?: string
  expiresAt?: string
}): Promise<{ ok: true; announcementId: string } | { ok: false; error: string }> {
  const me = await requireCapability('manageClassContent')
  try {
    const created = await createAnnouncementFromActionInput(me, {
      class_id: input.classId,
      title: input.title,
      message: input.message,
      publish_at: input.publishAt,
      expires_at: input.expiresAt,
    })
    revalidatePath('/classroom', 'layout')
    return { ok: true, announcementId: created.id }
  } catch (error) {
    return postError(error, 'Could not post the announcement.')
  }
}

/**
 * The composer's meeting branch: a stream post carrying a join link becomes a meet
 * (its own card + Q&A thread). Plain result (no redirect) so the client can handle
 * meet + announcement uniformly with a toast + refresh.
 */
export async function createMeetPost(input: {
  classId: string
  title: string
  message: string
  url: string
}): Promise<PostResult> {
  const me = await requireCapability('manageClassContent')
  try {
    await createMeetLinkFromActionInput(me, {
      classId: input.classId,
      title: input.title,
      url: input.url,
      description: input.message,
      scheduled_at: '',
    })
    revalidatePath('/classroom', 'layout')
    return { ok: true }
  } catch (error) {
    return postError(error, 'Could not create the meeting.')
  }
}
