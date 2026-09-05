import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for the cross-instance rate limiter: the atomic `rate_limit_hit()` RPC
 * over `rate_limit_counters`. Query construction - and interpreting PostgREST's error
 * shape - lives here so the security layer above holds only the degrade POLICY.
 */

/** One row of the RPC's single-row table result. */
export type RateLimitHit = { allowed: boolean; retryAfterSeconds: number } | null

/** Thrown when the RPC cannot be executed. `rpcMissing` distinguishes an unapplied
 *  migration (a deploy fault that silently disables the control) from a transient blip,
 *  so the caller can escalate the two differently. */
export class RateLimitRpcError extends Error {
  readonly rpcMissing: boolean
  constructor(message: string, rpcMissing: boolean) {
    super(message)
    this.name = 'RateLimitRpcError'
    this.rpcMissing = rpcMissing
  }
}

export async function rateLimitHit(key: string, limit: number, windowSeconds: number): Promise<RateLimitHit> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    const rpcMissing = error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message)
    throw new RateLimitRpcError(error.message, rpcMissing)
  }
  // The RPC returns a single-row table; supabase-js surfaces it as an array.
  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed?: boolean; retry_after_seconds?: number } | null | undefined
  if (!row) return null
  return { allowed: row.allowed === true, retryAfterSeconds: row.retry_after_seconds ?? 0 }
}
