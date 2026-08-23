/**
 * Lightweight fixed-window rate limiter.
 *
 * The counter store is in-process. On serverless (Vercel spins up multiple
 * instances under load) each instance keeps its own counters, so this defends
 * against casual bursts / abuse from a single client - NOT a large distributed
 * attack. For hard, distributed limits, swap `buckets` for Vercel KV / Upstash
 * Redis behind this same `rateLimit()` signature; callers don't change.
 */
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number }

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    if (buckets.size > 10000) sweep(now) // bound memory on a busy instance
    return { ok: true, remaining: opts.limit - 1, retryAfterSec: 0 }
  }
  if (b.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count += 1
  return { ok: true, remaining: opts.limit - b.count, retryAfterSec: 0 }
}

function sweep(now: number): void {
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
}

/** Best-effort client IP from proxy headers. Accepts both a fetch `Headers` and Next's
 *  `ReadonlyHeaders`. The value is a rate-limit key, so it must resist client spoofing:
 *  a client can prepend its own `x-forwarded-for` entry, so the LEFTMOST entry is
 *  attacker-controlled. Prefer Vercel's own `x-vercel-forwarded-for` (the client IP the
 *  platform observed); otherwise take the RIGHTMOST x-forwarded-for entry (the hop our
 *  trusted proxy appended), never the leftmost. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const vercel = headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0]!.trim()
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]!
  }
  return headers.get('x-real-ip') ?? 'unknown'
}
