import { NextResponse } from 'next/server'

/**
 * Ultra-lightweight liveness probe for cloud infrastructure load balancers, edge
 * ingress controllers, and container orchestrators. Returns 200 OK immediately
 * without querying the database. Confirms the Node/Next process is up and handling HTTP requests.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, status: 'live' }, { headers: { 'Cache-Control': 'no-store' } })
}
