import { ok, serverError } from '@/lib/api/response'
import { cronAuthFailure } from '@/lib/api/cron-auth'
import { assessQueueHealth } from '@/lib/services/queue-health'
import { logError } from '@/lib/observability/log'

// Queue-health alarm: checks the email + attachment queues for a backlog/age/failure
// breach and logs a structured error on breach. Wire this on a schedule (pg_cron or
// an external pinger) INDEPENDENTLY of drain-emails, so a queue that backs up because
// the drain itself isn't running is still noticed. Fail-closed on CRON_SECRET.
export async function GET(req: Request) {
  // Fail closed, in constant time, from one definition shared by every cron route.
  const denied = cronAuthFailure(req)
  if (denied) return denied
  try {
    return ok(await assessQueueHealth(Date.now()))
  } catch (error) {
    logError('cron.queueHealth', error)
    return serverError()
  }
}
