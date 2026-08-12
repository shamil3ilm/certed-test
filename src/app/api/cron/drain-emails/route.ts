import { timingSafeEqual } from 'node:crypto'
import { authFail, ok, serverError } from '@/lib/api/response'
import { drainPendingEmails } from '@/lib/services/email-drain'
import { logError } from '@/lib/observability/log'

/** Length-checked constant-time compare (mirrors the keepalive cron guard):
 *  timingSafeEqual throws on unequal lengths, so length is checked first and
 *  only the length can leak, never how many leading bytes matched. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// Drains the pending_emails queue - called on a schedule (Vercel Cron or
// pg_cron + pg_net; see migration 0058), NOT on a user request. Sending goes
// through Resend here rather than in SQL. Fail-closed: an unset CRON_SECRET
// keeps the endpoint 401 rather than public.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return authFail(new Error('unauthorized'))
  }
  try {
    return ok(await drainPendingEmails())
  } catch (error) {
    logError('cron.drainEmails', error)
    return serverError()
  }
}
