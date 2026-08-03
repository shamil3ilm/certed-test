import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/observability/log'

/**
 * Cross-instance rate limit backed by a Postgres counter (rate_limit_counters),
 * updated through the atomic rate_limit_hit() RPC. Unlike the in-process
 * rateLimit(), this limit holds across every serverless instance - use it for
 * the UNAUTHENTICATED, IP-keyed limiters (registration, contact) where
 * per-instance counters would multiply the real limit by the instance count.
 * Authenticated, user-keyed throttles stay on the cheaper in-process limiter.
 *
 * Fail-open: if the store is unreachable we allow the request (and log it).
 * These are abuse mitigations on endpoints that themselves hit the same DB, so
 * a DB outage already degrades them downstream - blocking here would only turn
 * an outage into a broken signup for no security gain.
 */
type SharedRateLimitResult = { ok: boolean; retryAfterSec: number }

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
    if (error) throw new Error(error.message)
    // The RPC returns a single-row table; supabase-js surfaces it as an array.
    const row = (Array.isArray(data) ? data[0] : data) as
      { allowed?: boolean; retry_after_seconds?: number } | null | undefined
    if (!row) return { ok: true, retryAfterSec: 0 }
    return { ok: row.allowed === true, retryAfterSec: row.retry_after_seconds ?? 0 }
  } catch (error) {
    logError('rateLimitShared', error, { key })
    return { ok: true, retryAfterSec: 0 }
  }
}
