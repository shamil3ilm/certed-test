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

export async function GET() {
  const db = await pingDatabase().catch(() => false)
  return NextResponse.json({ ok: true, db }, { headers: { 'Cache-Control': 'no-store' } })
}
