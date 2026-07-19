import { forbiddenText, notFoundText, textFail, tooManyRequestsText } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/require-role'
import { renderReportCardPdf } from '@/lib/report-card/render'
import { rateLimit } from '@/lib/security/rate-limit'

// Headless-Chromium render: pin the Node runtime + generous timeout so a cold
// start can't 504 (same as the finance PDFs).
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: Request, ctx: { params: { studentId: string } }) {
  let me
  try {
    me = await requireRoleApi(['admin', 'tutor', 'student'])
  } catch {
    return forbiddenText()
  }
  // Each render spins up headless Chromium - throttle per user to deter casual
  // bursts (per-instance; not a hard distributed cap).
  const rl = rateLimit(`report-card:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
  if (!rl.ok) return tooManyRequestsText(undefined, rl.retryAfterSec)

  let out
  try {
    out = await renderReportCardPdf(me, ctx.params.studentId)
  } catch {
    // A headless-Chromium failure (cold start / OOM / timeout) or a DB read error -
    // return a clean message rather than a bare 500.
    return textFail('Could not generate the report card. Please try again in a moment.', 502)
  }

  if (!out) return notFoundText()
  return new Response(new Uint8Array(out.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${out.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
