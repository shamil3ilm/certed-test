'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/services/notifications'

/** Mark all of the caller's notifications read (clears the header badge too). */
export async function markAllNotificationsReadAction(): Promise<void> {
  const me = await requireActiveProfile()
  await markAllNotificationsRead(me)
  revalidatePath('/notifications')
  revalidatePath('/', 'layout') // refresh the header unread badge
  redirect('/notifications?read=1') // show the confirmation banner
}

/**
 * Mark ONE notification read, then follow it where it points.
 *
 * A POST rather than a link, because Next prefetches links on hover: a GET that marked a
 * notification read would clear the list as the pointer crossed it. The trade is that a
 * notification cannot be middle-clicked into a new tab, which is the lesser loss.
 *
 * `link` comes from the row and is validated as an app-relative path before the redirect, so a
 * crafted form cannot turn this action into an open redirect to another site.
 */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const me = await requireActiveProfile()
  const id = String(formData.get('id') ?? '')
  if (id) await markNotificationRead(me, id)
  revalidatePath('/notifications')
  revalidatePath('/', 'layout') // the header badge counts unread

  const link = String(formData.get('link') ?? '')
  // One leading slash and no scheme: '/dashboard' yes, '//evil.test' and 'https://…' no.
  redirect(/^\/(?!\/)/.test(link) ? link : '/notifications')
}
