import { ok, serverError } from '@/lib/api/response'
import { cronAuthFailure } from '@/lib/api/cron-auth'
import { deliverDueReminders } from '@/lib/services/reminders-sweep'
import { announceAssignmentsDueSoon } from '@/lib/services/assignments-due-sweep'
import { logError } from '@/lib/observability/log'

export const runtime = 'nodejs'

/**
 * The job for everything whose time has come: reminders that are due, and work that falls due
 * tomorrow.
 *
 * This is the only reader of `reminders.remind_at`, and the only one that reads
 * `assignments.due_date` as a deadline rather than a sort key. Without it both are times that
 * reach only someone already looking at the page they were trying to send them to.
 *
 * Both sweeps ride ONE schedule deliberately: they want the same cadence, and every additional
 * cron is another thing that has to be wired per environment and can silently not be. They run
 * INDEPENDENTLY though - one failing (an unapplied migration, a bad batch) must not stop the
 * other from delivering.
 *
 * Fail-closed: an unset CRON_SECRET keeps the endpoint 401 rather than public.
 *
 * Scheduling (once per environment) - two equivalent options, as with the other crons:
 *
 *   A. Vercel Cron (Pro plan for sub-daily frequency): add to vercel.json
 *      ->  { "path": "/api/cron/send-reminders", "schedule": "*\/15 * * * *" }
 *
 *   B. pg_cron + pg_net (plan-independent), run once with your URL + secret:
 *      These routes accept GET only, so the call is net.http_get - an http_post is answered 405.
 *        select cron.schedule('send-reminders', '*\/15 * * * *', $q$
 *          select net.http_get(
 *            url     := 'https://app.certedacademia.com/api/cron/send-reminders',
 *            headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
 *          );
 *        $q$);
 *
 * Every 15 minutes, unlike the daily sweeps: a reminder that lands hours after the time it names
 * has already failed. The claims make a missed or doubled run harmless - a later pass takes
 * whatever the last one did not, and neither sweep can send the same thing twice.
 */
export async function GET(req: Request) {
  // Fail closed, in constant time, from one definition shared by every cron route.
  const denied = cronAuthFailure(req)
  if (denied) return denied

  const [reminders, dueSoon] = await Promise.allSettled([deliverDueReminders(), announceAssignmentsDueSoon()])
  if (reminders.status === 'rejected') logError('cron.sendReminders.reminders', reminders.reason)
  if (dueSoon.status === 'rejected') logError('cron.sendReminders.assignmentsDueSoon', dueSoon.reason)
  // Only a pass where NOTHING ran is a failed pass. A half that failed comes back null rather
  // than missing, so the response says which sweep ran instead of hiding it behind a 200.
  if (reminders.status === 'rejected' && dueSoon.status === 'rejected') return serverError()

  return ok({
    reminders: reminders.status === 'fulfilled' ? reminders.value : null,
    assignmentsDueSoon: dueSoon.status === 'fulfilled' ? dueSoon.value : null,
  })
}
