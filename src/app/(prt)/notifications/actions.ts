'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireActiveProfile } from '@/lib/auth/require-role'
import { markAllNotificationsRead } from '@/lib/services/notifications'

/** Mark all of the caller's notifications read (clears the header badge too). */
export async function markAllNotificationsReadAction(): Promise<void> {
  const me = await requireActiveProfile()
  await markAllNotificationsRead(me)
  revalidatePath('/notifications')
  revalidatePath('/', 'layout') // refresh the header unread badge
  redirect('/notifications?read=1') // show the confirmation banner
}
