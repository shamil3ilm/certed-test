import 'server-only'
import { selectEmailQueueStats } from '@/lib/data/pending-emails'
import { countFailedAttachments } from '@/lib/data/attachments'
import { logError } from '@/lib/observability/log'

/**
 * Watches the async queues that otherwise fail silently - the notification email
 * queue (pending_emails) and custodial uploads (attachments). On a breach it logs
 * a structured error, which is the alarm channel: whatever ingests server logs.
 *
 * NOT an email alert - the email queue itself may be the thing that's broken.
 * Read-only, so it's safe to run on every drain pass and as a standalone cron.
 * Thresholds are conservative for a small academy (a healthy queue sits near zero).
 */

const EMAIL_DEPTH_ALARM = 50 // pending emails waiting
const EMAIL_AGE_ALARM_MIN = 30 // oldest pending older than this = drain is stuck
const EMAIL_FAILED_ALARM = 10 // terminal send failures piling up
const ATTACH_FAILED_ALARM = 20 // failed custodial uploads piling up

export type QueueHealth = {
  emails: { pending: number; failed: number; oldestPendingMinutes: number | null }
  attachmentsFailed: number
  alarms: string[]
}

export async function assessQueueHealth(nowMs: number): Promise<QueueHealth> {
  const [emails, attachmentsFailed] = await Promise.all([selectEmailQueueStats(), countFailedAttachments()])
  const oldestPendingMinutes =
    emails.oldestPendingAt == null
      ? null
      : Math.max(0, Math.floor((nowMs - new Date(emails.oldestPendingAt).getTime()) / 60000))

  const alarms: string[] = []
  if (emails.pending >= EMAIL_DEPTH_ALARM) alarms.push(`email queue depth ${emails.pending}`)
  if (oldestPendingMinutes != null && oldestPendingMinutes >= EMAIL_AGE_ALARM_MIN) {
    alarms.push(`oldest pending email ${oldestPendingMinutes}m old`)
  }
  if (emails.failed >= EMAIL_FAILED_ALARM) alarms.push(`${emails.failed} failed emails`)
  if (attachmentsFailed >= ATTACH_FAILED_ALARM) alarms.push(`${attachmentsFailed} failed attachments`)

  if (alarms.length > 0) {
    logError('queue.health', new Error(`Queue backlog: ${alarms.join('; ')}`))
  }

  return {
    emails: { pending: emails.pending, failed: emails.failed, oldestPendingMinutes },
    attachmentsFailed,
    alarms,
  }
}
