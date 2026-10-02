import { ok, serverError } from '@/lib/api/response'
import { cronAuthFailure } from '@/lib/api/cron-auth'
import { checkDatabaseLiveness } from '@/lib/services/health'
import { assessQueueHealth } from '@/lib/services/queue-health'
import { logError } from '@/lib/observability/log'

// Pinged daily by Vercel Cron so the free Supabase project doesn't pause.
export async function GET(req: Request) {
  // Fail closed, in constant time, from one definition shared by every cron route.
  const denied = cronAuthFailure(req)
  if (denied) return denied
  if (!(await checkDatabaseLiveness())) return serverError()
  // Piggy-back the queue-health alarm on the one cron Hobby allows: it logs a
  // structured breach if the email/attachment queues back up or RLS is disabled on a
  // sensitive table. Best-effort - a health-check failure must never fail keepalive,
  // and assessQueueHealth already logs any breach itself.
  try {
    await assessQueueHealth(Date.now())
  } catch (error) {
    logError('cron.keepalive.queueHealth', error)
  }
  return ok({ alive: true })
}
