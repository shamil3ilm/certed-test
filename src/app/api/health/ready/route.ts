import { NextResponse } from 'next/server'
import { checkDatabaseLiveness } from '@/lib/services/health'

/**
 * Deep readiness probe for synthetic monitors, uptime checkers, and traffic routers.
 * Confirms database connectivity and reports round-trip latency before routing user traffic.
 * If the database is unreachable, returns 503 so traffic managers temporarily divert traffic.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const db = await checkDatabaseLiveness()
  const latencyMs = Date.now() - start

  return NextResponse.json(
    {
      ok: db,
      status: db ? 'ready' : 'degraded',
      db,
      latencyMs,
      checkedAt: new Date().toISOString(),
    },
    {
      status: db ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
