import { invalidJson, ok, tooManyRequests, fail } from '@/lib/api/response'
import { INVALID_REQUEST_MESSAGE, TOO_MANY_MESSAGES_MESSAGE } from '@/lib/api/messages'
import { relayContactSubmission } from '@/lib/services/contact'
import { rateLimit, clientIp } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
  const rl = rateLimit(`contact:${clientIp(request.headers)}`, { limit: 5, windowMs: 10 * 60 * 1000 })
  if (!rl.ok) return tooManyRequests(TOO_MANY_MESSAGES_MESSAGE, rl.retryAfterSec)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return invalidJson(INVALID_REQUEST_MESSAGE)
  }

  const result = await relayContactSubmission(raw, { scriptUrl: process.env.GOOGLE_SCRIPT_URL })
  return result.success ? ok({}) : fail(result.error, result.status, result.code)
}
