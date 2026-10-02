import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The delivery sweep's access to `reminders` - SERVICE ROLE, unlike data/reminders.ts.
 *
 * That module is RLS-client throughout because every one of its reads belongs to the person
 * making it. The sweep has no person: it runs from a cron with no session, so under RLS it
 * would see nothing at all. It lives in its own file so the RLS-only contract next door stays
 * true, and so the one place holding service-role reminder access is obvious.
 */

export type DueReminder = {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
}

/** Reminders delivered per pass. A backlog is drained over consecutive passes rather than in
 *  one unbounded write - see the capped-reads note for this function. */
const CLAIM_BATCH = 200

/**
 * Take ownership of the reminders that are due, and return them.
 *
 * Two steps on purpose. The select finds candidates; the update CLAIMS them, and its
 * `notified_at is null` predicate is what makes the claim exclusive - two overlapping passes
 * (a slow run, a retried cron) each claim a disjoint set, and only rows this call actually
 * stamped come back. Claiming BEFORE notifying means a crash mid-pass loses a reminder rather
 * than sending it twice, the same trade the email queue makes.
 */
export async function claimDueReminders(nowIso: string): Promise<DueReminder[]> {
  const admin = createAdminClient()
  const { data: due, error } = await admin
    .from('reminders')
    .select('id')
    .lte('remind_at', nowIso)
    .is('notified_at', null)
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
    .limit(CLAIM_BATCH)
  if (error) throw new Error(`reminders.selectDue: ${error.message}`)

  const ids = (due ?? []).map((row) => (row as { id: string }).id)
  if (ids.length === 0) return []

  const { data: claimed, error: claimError } = await admin
    .from('reminders')
    .update({ notified_at: nowIso })
    .in('id', ids)
    .is('notified_at', null)
    .select('id, user_id, title, description, remind_at')
  if (claimError) throw new Error(`reminders.claimDue: ${claimError.message}`)
  return (claimed ?? []) as DueReminder[]
}

export type DueReminderBacklog = { due: number; oldestDueAt: string | null }

/**
 * How many reminders are due and still undelivered, and how long the oldest has waited.
 *
 * The health alarm's reading of this sweep. The queue this drains has no depth gauge of its own:
 * `reminders` rows are written by people, not by a queue writer, so a stalled sweep looks exactly
 * like a quiet day unless something counts what is waiting.
 */
export async function selectDueReminderBacklog(nowIso: string): Promise<DueReminderBacklog> {
  const admin = createAdminClient()

  // TWO queries, not one `count: 'exact'` with `.limit(1)`. A count returned alongside a row cap
  // is the total either way, but only if you know that - and getting it wrong would report "1 due"
  // forever while the real backlog grew. `head: true` cannot return rows, and the second query
  // cannot return a count, so neither number can be the other one misread.
  const { count, error } = await admin
    .from('reminders')
    .select('remind_at', { count: 'exact', head: true })
    .lte('remind_at', nowIso)
    .is('notified_at', null)
    .eq('is_sent', false)
  if (error) throw new Error(`reminders.dueBacklog: ${error.message}`)

  const { data, error: oldestError } = await admin
    .from('reminders')
    .select('remind_at')
    .lte('remind_at', nowIso)
    .is('notified_at', null)
    .eq('is_sent', false)
    .order('remind_at', { ascending: true })
    .limit(1)
  if (oldestError) throw new Error(`reminders.dueBacklog.oldest: ${oldestError.message}`)

  const oldest = (data ?? [])[0] as { remind_at: string } | undefined
  return { due: count ?? 0, oldestDueAt: oldest?.remind_at ?? null }
}
