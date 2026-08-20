import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { logError } from '@/lib/observability/log'

/**
 * Cross-instance rate limit backed by a Postgres counter (rate_limit_counters),
 * updated through the atomic rate_limit_hit() RPC. Unlike the in-process
 * rateLimit(), this limit holds across every serverless instance - use it for
 * the UNAUTHENTICATED, IP-keyed limiters (registration, contact) where
 * per-instance counters would multiply the real limit by the instance count.
 * Authenticated, user-keyed throttles stay on the cheaper in-process limiter.
 *
 * Degrade, don't disable: if the store is unreachable (or the RPC is missing) we
 * fall BACK to the in-process rateLimit() rather than allowing unconditionally.
 * That still bounds an abuser per instance - so a DB outage degrades the limit
 * (real ceiling = limit x instances) instead of removing it entirely - while
 * keeping the intent that an outage must not turn signup into a hard failure.
 */
type SharedRateLimitResult = { ok: boolean; retryAfterSec: number }

/** In-process fallback when the shared store can't answer. Same key + budget, so
 *  a returning client keeps hitting the same per-instance bucket. */
function inProcessFallback(key: string, opts: { limit: number; windowSeconds: number }): SharedRateLimitResult {
  const r = rateLimit(key, { limit: opts.limit, windowMs: opts.windowSeconds * 1000 })
  return { ok: r.ok, retryAfterSec: r.retryAfterSec }
}

export async function rateLimitShared(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<SharedRateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSeconds,
    })
    if (error) {
      // A MISSING function is a deploy problem (the rate_limit_counters migration
      // was never applied), not a transient blip - and it silently disables this
      // control. Flag it distinctly so it's actioned, not lost among network noise.
      const rpcMissing = error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message)
      // Log the limiter scope ('register' / 'contact'), never the full key - the
      // key embeds the caller's raw IP, and meta is forwarded to the error tracker.
      // The scope alone tells which limiter is failing, which is all the diagnostic
      // value the address carried.
      logError(rpcMissing ? 'rateLimitShared:rpc-missing' : 'rateLimitShared', new Error(error.message), {
        scope: key.split(':')[0],
        ...(rpcMissing ? { action: 'apply the rate_limit_counters migration (rate_limit_hit RPC)' } : {}),
      })
      return inProcessFallback(key, opts) // degrade to the per-instance limiter, not unlimited
    }
    // The RPC returns a single-row table; supabase-js surfaces it as an array.
    const row = (Array.isArray(data) ? data[0] : data) as
      { allowed?: boolean; retry_after_seconds?: number } | null | undefined
    if (!row) return { ok: true, retryAfterSec: 0 }
    return { ok: row.allowed === true, retryAfterSec: row.retry_after_seconds ?? 0 }
  } catch (error) {
    // Scope only, not the IP-bearing key - see the rpc-error branch above.
    logError('rateLimitShared', error, { scope: key.split(':')[0] })
    return inProcessFallback(key, opts) // degrade to the per-instance limiter, not unlimited
  }
}
