import 'server-only'
import { emailEnabled, sendEmail } from '@/lib/email/resend'
import { markEmailFailed, markEmailSent, selectPendingEmails } from '@/lib/data/pending-emails'

const DRAIN_BATCH = 50
const MAX_ATTEMPTS = 3

export type DrainResult = { processed: number; sent: number; failed: number; retried: number }

const EMPTY: DrainResult = { processed: 0, sent: 0, failed: 0, retried: 0 }

/**
 * Sends the oldest queued emails and records each outcome. Per-row best-effort:
 * a failed send is retried on later drains up to MAX_ATTEMPTS, then parked as
 * 'failed' (its `last_error` kept for inspection). Only ever touches rows it has
 * selected as pending, so it is safe to run on a frequent schedule.
 */
export async function drainPendingEmails(limit = DRAIN_BATCH): Promise<DrainResult> {
  // If email is turned off (or unconfigured), don't burn attempts - leave the
  // queue intact for when it is re-enabled.
  if (!emailEnabled()) return EMPTY

  const rows = await selectPendingEmails(limit)
  let sent = 0
  let failed = 0
  let retried = 0

  for (const row of rows) {
    const attempts = row.attempts + 1
    let ok = false
    let message = ''
    try {
      ok = await sendEmail(row.to_email, row.subject, row.html)
      if (!ok) message = 'sendEmail returned false (provider error or email disabled)'
    } catch (error) {
      message = error instanceof Error ? error.message : 'unknown error'
    }

    if (ok) {
      await markEmailSent(row.id, attempts)
      sent += 1
    } else {
      const terminal = attempts >= MAX_ATTEMPTS
      await markEmailFailed(row.id, attempts, terminal, message)
      if (terminal) failed += 1
      else retried += 1
    }
  }

  return { processed: rows.length, sent, failed, retried }
}
