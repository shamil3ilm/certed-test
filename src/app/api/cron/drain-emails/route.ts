import { ok, serverError } from '@/lib/api/response'
import { cronAuthFailure } from '@/lib/api/cron-auth'
import { drainPendingEmails } from '@/lib/services/email-drain'
import { assessQueueHealth } from '@/lib/services/queue-health'
import { logError } from '@/lib/observability/log'

// Drains the pending_emails queue - called on a schedule (Vercel Cron or
// pg_cron + pg_net; see migration 0058), NOT on a user request. Sending goes
// through Resend here rather than in SQL. Fail-closed: an unset CRON_SECRET
// keeps the endpoint 401 rather than public.
export async function GET(req: Request) {
  // Fail closed, in constant time, from one definition shared by every cron route.
  const denied = cronAuthFailure(req)
  if (denied) return denied
  try {
    // Drain, then self-monitor: whatever is left after a pass is checked for a
    // backlog/age/failure breach (alarmed via the log). Free queue-watch on the
    // schedule the drain already runs on.
    const drained = await drainPendingEmails()
    const health = await assessQueueHealth(Date.now())
    return ok({ ...drained, health })
  } catch (error) {
    logError('cron.drainEmails', error)
    return serverError()
  }
}
