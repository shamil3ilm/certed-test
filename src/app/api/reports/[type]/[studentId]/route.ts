import { authTextFail, notFoundText, textFail, tooManyRequestsText } from '@/lib/api/response'
import { assertActiveProfile } from '@/lib/auth/guards'
import { getActorContext } from '@/lib/session/actor-context'
import { isStudentReportType, renderStudentReport } from '@/lib/reports/render'
import { rateLimit } from '@/lib/security/rate-limit'

// A PDF render spins up headless Chromium (the HTML/print variant does not), so
// pin the Node runtime + generous timeout, matching the other document routes.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request, ctx: { params: Promise<{ type: string; studentId: string }> }) {
  const { type, studentId } = await ctx.params
  // Narrow `type` once here so it carries StudentReportType to renderStudentReport.
  if (!isStudentReportType(type)) return notFoundText()

  let actor
  let me
  try {
    actor = await getActorContext()
    me = assertActiveProfile(actor)
  } catch (error) {
    return authTextFail(error)
  }

  const rl = rateLimit(`report:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
  if (!rl.ok) return tooManyRequestsText(undefined, rl.retryAfterSec)

  const format = new URL(req.url).searchParams.get('format') === 'html' ? 'html' : 'pdf'

  let out
  try {
    out = await renderStudentReport(actor, studentId, type, format)
  } catch {
    return textFail('Could not generate the report. Please try again in a moment.', 502)
  }
  if (!out) return notFoundText()

  const headers = {
    'Content-Type': out.contentType,
    'Content-Disposition': `inline; filename="${out.filename}"`,
    'Cache-Control': 'private, no-store',
  }
  // Split by type so each Response body is a clean BodyInit (string for the
  // print-friendly HTML, bytes for the PDF).
  if (typeof out.body === 'string') return new Response(out.body, { headers })
  return new Response(new Uint8Array(out.body), { headers })
}
