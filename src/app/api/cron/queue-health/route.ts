import { timingSafeEqual } from 'node:crypto'
import { authFail, ok, serverError } from '@/lib/api/response'
import { assessQueueHealth } from '@/lib/services/queue-health'
import { logError } from '@/lib/observability/log'

/** Length-checked constant-time compare (mirrors the other cron guards). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// Queue-health alarm: checks the email + attachment queues for a backlog/age/failure
// breach and logs a structured error on breach. Wire this on a schedule (pg_cron or
// an external pinger) INDEPENDENTLY of drain-emails, so a queue that backs up because
// the drain itself isn't running is still noticed. Fail-closed on CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return authFail(new Error('unauthorized'))
  }
  try {
    return ok(await assessQueueHealth(Date.now()))
  } catch (error) {
    logError('cron.queueHealth', error)
    return serverError()
  }
}
