import { NextResponse } from 'next/server'
import { pingDatabase } from '@/lib/data/org-settings'

/**
 * Public, unauthenticated keep-warm target for an external uptime pinger (hit it
 * every ~5 min). Keeps the serverless function AND the Supabase project warm so
 * real users don't pay the cold-start penalty. Touches the DB with a trivial read
 * only and returns no data. The secret-gated /api/cron/keepalive stays for Vercel
 * Cron; this is the public equivalent a free third-party pinger can call.
 */
export const dynamic = 'force-dynamic'

// The endpoint is public and hits the DB, so an anonymous flood could amplify into
// one round-trip per request. Memoise the ping result briefly: a burst collapses to
// a single DB read per window, while a normal ~5-min pinger always misses it and so
// still performs the real keep-warm ping. Per-instance and best-effort by design -
// a stronger guarantee isn't warranted for a liveness probe.
const PING_TTL_MS = 30_000
let cachedPing: { db: boolean; at: number } | null = null

export async function GET() {
  const now = Date.now()
  if (!cachedPing || now - cachedPing.at > PING_TTL_MS) {
    const db = await pingDatabase().catch(() => false)
    cachedPing = { db, at: now }
  }
  return NextResponse.json({ ok: true, db: cachedPing.db }, { headers: { 'Cache-Control': 'no-store' } })
}
