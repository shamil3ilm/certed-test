import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { authFail } from '@/lib/api/response'

/** Length-checked constant-time compare: timingSafeEqual throws on unequal lengths, so the
 *  length is checked first and only the length can leak, never how many leading bytes matched. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * The gate every /api/cron route stands behind: a 401 response when the caller did not present
 * CRON_SECRET as a bearer token, or null when it did, so a route reads
 * `const denied = cronAuthFailure(req); if (denied) return denied`.
 *
 * Fail closed - an UNSET secret leaves the endpoint answering 401 rather than turning it public,
 * which matters because these routes drain queues and reconcile records with no user in sight.
 * The comparison is constant time so the secret cannot be recovered a byte at a time by timing
 * how long a mismatch takes to reject.
 *
 * It lives here, once, because six routes carried byte-identical copies of it: a security check
 * duplicated six ways is a security check that will eventually be copied a seventh time with a
 * `!==` in it.
 */
export function cronAuthFailure(req: Request): ReturnType<typeof authFail> | null {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return authFail(new Error('unauthorized'))
  }
  return null
}
