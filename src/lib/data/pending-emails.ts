import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `pending_emails` - the notification email queue. Service-role
 * only: the table has no RLS policy, so enqueue and drain run through the admin
 * client. notify() enqueues; the drain route sends and records the outcome.
 */

export type PendingEmailInput = { to_email: string; subject: string; html: string }
export type PendingEmailRow = PendingEmailInput & { id: string; attempts: number }

/** Enqueue already-rendered emails in one insert (one row per recipient). */
export async function enqueuePendingEmails(rows: PendingEmailInput[]): Promise<void> {
  if (rows.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin.from('pending_emails').insert(rows)
  if (error) throw new Error(`pendingEmails.enqueue: ${error.message}`)
}

/** The oldest still-pending emails, for one drain pass. */
export async function selectPendingEmails(limit: number): Promise<PendingEmailRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pending_emails')
    .select('id, to_email, subject, html, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`pendingEmails.selectPending: ${error.message}`)
  return (data ?? []) as PendingEmailRow[]
}

export async function markEmailSent(id: string, attempts: number): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('pending_emails')
    .update({ status: 'sent', attempts, sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`pendingEmails.markSent: ${error.message}`)
}

/** Records a failed attempt. `terminal` (attempts exhausted) moves the row to
 *  'failed'; otherwise it stays 'pending' for the next drain to retry. */
export async function markEmailFailed(id: string, attempts: number, terminal: boolean, message: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('pending_emails')
    .update({ status: terminal ? 'failed' : 'pending', attempts, last_error: message.slice(0, 500) })
    .eq('id', id)
  if (error) throw new Error(`pendingEmails.markFailed: ${error.message}`)
}
