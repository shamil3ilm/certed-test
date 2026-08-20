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

/** Queue-health snapshot: pending depth, terminal-failed count, and the age of the
 *  oldest still-pending email - so a stuck drain or a failing Resend can be alarmed. */
export async function selectEmailQueueStats(): Promise<{
  pending: number
  failed: number
  oldestPendingAt: string | null
}> {
  const admin = createAdminClient()
  const [pending, failed, oldest] = await Promise.all([
    admin.from('pending_emails').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('pending_emails').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin
      .from('pending_emails')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
    oldestPendingAt: (oldest.data as { created_at: string } | null)?.created_at ?? null,
  }
}

/** Atomically claim the oldest pending emails for one drain pass: the claim_pending_emails
 *  RPC flips them to 'sending' and returns them under FOR UPDATE SKIP LOCKED, so two
 *  concurrent drains get DISJOINT batches and a slow pass can't be re-sent by the next
 *  one. Returns the same shape as a plain read (extra row columns are ignored). */
export async function claimPendingEmails(limit: number): Promise<PendingEmailRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_pending_emails', { p_limit: limit })
  if (error) throw new Error(`pendingEmails.claim: ${error.message}`)
  return (data ?? []) as PendingEmailRow[]
}

/** Return rows stuck 'sending' past their lease to 'pending', so emails a drain
 *  claimed but never finished (process crash mid-send) are retried instead of
 *  stranded. Run at the start of a pass, before claiming. */
export async function requeueStaleClaims(claimedBeforeIso: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('pending_emails')
    .update({ status: 'pending', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', claimedBeforeIso)
  if (error) throw new Error(`pendingEmails.requeueStale: ${error.message}`)
}

/** Records a successful send. Compare-and-swap on the 'sending' claim: only the
 *  drain that still holds the claim writes the outcome, so a row reaped and
 *  re-claimed by another pass isn't double-marked. */
export async function markEmailSent(id: string, attempts: number): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('pending_emails')
    .update({ status: 'sent', attempts, sent_at: new Date().toISOString(), claimed_at: null })
    .eq('id', id)
    .eq('status', 'sending')
  if (error) throw new Error(`pendingEmails.markSent: ${error.message}`)
}

/** Records a failed attempt. `terminal` (attempts exhausted) moves the row to
 *  'failed'; otherwise it returns to 'pending' for the next drain to re-claim.
 *  Compare-and-swap on the 'sending' claim, as with markEmailSent. */
export async function markEmailFailed(id: string, attempts: number, terminal: boolean, message: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('pending_emails')
    .update({ status: terminal ? 'failed' : 'pending', attempts, last_error: message.slice(0, 500), claimed_at: null })
    .eq('id', id)
    .eq('status', 'sending')
  if (error) throw new Error(`pendingEmails.markFailed: ${error.message}`)
}
