import { timingSafeEqual } from 'node:crypto'
import { authFail, ok, serverError } from '@/lib/api/response'
import { reconcileAttachments } from '@/lib/services/attachments/reconcile'
import { logError } from '@/lib/observability/log'

// Node runtime: reconciliation lists + deletes files through the Drive REST API.
export const runtime = 'nodejs'

/** Length-checked constant-time compare (mirrors the drain-emails cron guard):
 *  timingSafeEqual throws on unequal lengths, so length is checked first and only
 *  the length can leak, never how many leading bytes matched. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Sweeps the custodial-attachment two-phase-commit gap: rows stuck `pending` past
 * the hour become `failed`, and Drive files whose row is gone or terminal are
 * deleted (see the reconcile service). Called on a schedule, NOT on a user request.
 * Fail-closed: an unset CRON_SECRET keeps the endpoint 401 rather than public.
 *
 * Scheduling (once per environment, with your deployed values) - two equivalent
 * options, as with drain-emails:
 *
 *   A. Vercel Cron (needs the Pro plan for sub-daily frequency): add to vercel.json
 *      ->  { "path": "/api/cron/reconcile-attachments", "schedule": "0 3 * * *" }
 *
 *   B. pg_cron + pg_net (plan-independent), run once with your URL + secret:
 *        select cron.schedule('reconcile-attachments', '0 3 * * *', $q$
 *          select net.http_post(
 *            url     := 'https://app.certedacademia.com/api/cron/reconcile-attachments',
 *            headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
 *          );
 *        $q$);
 *
 * Daily is ample: nothing here is time-critical (a stuck row is already non-servable
 * and an orphan file only wastes space), and the stale-pending cutoff is an hour.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return authFail(new Error('unauthorized'))
  }
  try {
    return ok(await reconcileAttachments())
  } catch (error) {
    logError('cron.reconcileAttachments', error)
    return serverError()
  }
}
