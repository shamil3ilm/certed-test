import 'server-only'
import { claimDueReminders } from '@/lib/data/reminders-sweep'
import { notifyBestEffort } from '@/lib/services/notifications'

export type ReminderSweepResult = { delivered: number }

/**
 * Deliver every reminder whose time has come.
 *
 * The reminder's own title is the notification's title - the person wrote it, so it is already
 * in their words - prefixed so the feed says what kind of thing it is. An ASSIGNED reminder
 * (0086) goes to its assignee, `user_id`, not to the tutor who set it.
 *
 * Each notification is best-effort, as everywhere else: the claim has already committed, so a
 * notifier failure costs that one reminder rather than stopping the pass and stranding the
 * rest of the batch as claimed-but-undelivered.
 */
export async function deliverDueReminders(): Promise<ReminderSweepResult> {
  const claimed = await claimDueReminders(new Date().toISOString())
  for (const reminder of claimed) {
    await notifyBestEffort([reminder.user_id], {
      kind: 'schedule',
      title: `Reminder: ${reminder.title}`,
      body: reminder.description,
      link: '/dashboard',
    })
  }
  return { delivered: claimed.length }
}
