import { timingSafeEqual } from 'node:crypto'
import { authFail, ok, serverError } from '@/lib/api/response'
import { pingDatabase } from '@/lib/data/org-settings'

/** Length-checked constant-time compare. timingSafeEqual throws on unequal
 *  buffer lengths, so the length is checked first; only the length itself leaks,
 *  never how many leading bytes of the secret matched. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// Pinged daily by Vercel Cron so the free Supabase project doesn't pause.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')
  // Fail closed: an unset secret must never make the endpoint public. Compare in
  // constant time so the correct secret can't be recovered a byte at a time by
  // measuring how long a `!==` takes to reject.
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return authFail(new Error('unauthorized'))
  }
  if (!(await pingDatabase())) return serverError()
  return ok({ alive: true })
}
