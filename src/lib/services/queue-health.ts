import 'server-only'
import { selectEmailQueueStats } from '@/lib/data/pending-emails'
import { countFailedAttachments } from '@/lib/data/attachments'
import { selectRlsDisabledTables } from '@/lib/data/schema-health'
import { logError } from '@/lib/observability/log'

/**
 * Watches the things that otherwise fail silently - the notification email queue
 * (pending_emails), custodial uploads (attachments), and row-level security on the
 * data/PII tables. On a breach it logs a structured error, which is the alarm
 * channel: whatever ingests server logs.
 *
 * NOT an email alert - the email queue itself may be the thing that's broken.
 * Read-only, so it's safe to run on every drain pass and as a standalone cron.
 * Thresholds are conservative for a small academy (a healthy queue sits near zero).
 */

const EMAIL_DEPTH_ALARM = 50 // pending emails waiting
const EMAIL_AGE_ALARM_MIN = 30 // oldest pending older than this = drain is stuck
const EMAIL_FAILED_ALARM = 10 // terminal send failures piling up
const ATTACH_FAILED_ALARM = 20 // failed custodial uploads piling up

// The data/PII tables whose per-row access relies on RLS; if any has RLS disabled
// (a hand-misconfigured DB) reads could fail open. This turns the "are the security
// migrations applied?" unknown into an observable, alarmed signal.
const RLS_REQUIRED_TABLES = [
  'attachments',
  'class_sessions',
  'attendance',
  'submissions',
  'assignments',
  'resources',
  'announcements',
  'messages',
  'conversations',
  'conversation_participants',
  'notifications',
  'enrollments',
  'mentorships',
  'profiles',
  'org_settings',
  'receipts',
  'payslips',
  // Newest PII / authority tables whose read boundary is RLS-only - include them so a
  // disabled-RLS misconfiguration is caught here too (they were missing before).
  'guardians',
  'consents',
  'capability_overrides',
  'persona_assignments',
  'class_tutors',
  'audit_log',
  // Pastoral notes about a student (0078) - read boundary is RLS-only, so a disabled
  // policy would expose them to the whole authenticated role.
  'mentee_notes',
]

export type QueueHealth = {
  emails: { pending: number; failed: number; oldestPendingMinutes: number | null }
  attachmentsFailed: number
  rlsDisabledTables: string[]
  alarms: string[]
}

export async function assessQueueHealth(nowMs: number): Promise<QueueHealth> {
  const [emails, attachmentsFailed, rlsDisabledTables] = await Promise.all([
    selectEmailQueueStats(),
    countFailedAttachments(),
    selectRlsDisabledTables(RLS_REQUIRED_TABLES),
  ])
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
  // Any table without RLS is a security fault, not a threshold - alarm on the first.
  if (rlsDisabledTables.length > 0) alarms.push(`RLS disabled on: ${rlsDisabledTables.join(', ')}`)

  if (alarms.length > 0) {
    logError('queue.health', new Error(`Health breach: ${alarms.join('; ')}`))
  }

  return {
    emails: { pending: emails.pending, failed: emails.failed, oldestPendingMinutes },
    attachmentsFailed,
    rlsDisabledTables,
    alarms,
  }
}
