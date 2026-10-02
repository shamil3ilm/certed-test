import { ok, serverError } from '@/lib/api/response'
import { cronAuthFailure } from '@/lib/api/cron-auth'
import { reconcileConsents } from '@/lib/services/consents'
import { logError } from '@/lib/observability/log'

export const runtime = 'nodejs'

/**
 * Reports active people with no current acceptance on the consent log.
 *
 * Recording acceptance is best-effort by design - a consent-write hiccup must not fail an
 * account that is already bound - so a failure leaves a gap that only a log line records.
 * This is the follow-up those log lines promise. It REPORTS ONLY: a sweep cannot know that
 * someone consented, and writing a row to make the numbers agree would forge the fact the
 * log exists to evidence.
 *
 * Fail-closed: an unset CRON_SECRET keeps the endpoint 401 rather than public.
 *
 * Scheduling (once per environment) - two equivalent options, as with the other crons:
 *
 *   A. Vercel Cron (Pro plan for sub-daily frequency): add to vercel.json
 *      ->  { "path": "/api/cron/reconcile-consents", "schedule": "0 4 * * *" }
 *
 *   B. pg_cron + pg_net (plan-independent), run once with your URL + secret:
 *        select cron.schedule('reconcile-consents', '0 4 * * *', $q$
 *          select net.http_get(
 *            url     := 'https://app.certedacademia.com/api/cron/reconcile-consents',
 *            headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
 *          );
 *        $q$);
 *
 * Daily is ample: the gap is a record-keeping defect, not a live access problem - the person
 * keeps working either way, and the settings page re-prompts them whenever they visit.
 */
export async function GET(req: Request) {
  // Fail closed, in constant time, from one definition shared by every cron route.
  const denied = cronAuthFailure(req)
  if (denied) return denied
  try {
    const result = await reconcileConsents()
    // Surfaced, not just returned: the cron response is read by whatever invoked it, which
    // may be a scheduler that discards the body. A gap in the consent trail should reach the
    // logs the same way a failed write did.
    if (result.missing > 0) {
      logError('cron.reconcileConsents:gap', new Error(`${result.missing} active profile(s) without current consent`), {
        missing: result.missing,
        activeProfiles: result.activeProfiles,
      })
    }
    return ok(result)
  } catch (error) {
    logError('cron.reconcileConsents', error)
    return serverError()
  }
}
