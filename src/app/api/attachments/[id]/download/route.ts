import { authTextFail, notFoundText, tooManyRequestsText, textFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { rateLimit } from '@/lib/security/rate-limit'
import { selectReadableActiveAttachment } from '@/lib/data/attachments'
import { getDriveStorage } from '@/lib/google/drive-storage'
import { logError } from '@/lib/observability/log'

// Node runtime: the route streams bytes from the Drive REST API.
export const runtime = 'nodejs'

/**
 * Access-checked download/preview of a custodial attachment. The bytes are private
 * to the academy's Drive account, so - unlike the old link model - they are never
 * public: every request streams THROUGH the app behind an authorization check.
 *
 * Authorization is RLS, exactly as getSubmission / getAnnouncement authorize their
 * reads: selectReadableActiveAttachment goes through the request-scoped client, and
 * attachments_read (migration 0057) mirrors each owner's own visibility rule, so a
 * caller who may not read the owner gets nothing. Re-deriving those three rules in
 * app code would only invite drift, which is what that policy is written to avoid;
 * the RLS harness verifies the policy against real Postgres. The coarse
 * viewClasses gate here just guarantees an active session for RLS to act on, and a
 * missing/forbidden attachment returns an identical 404 either way.
 *
 * `?inline=1` streams for in-browser preview (Content-Disposition: inline); the
 * default is a download. There is deliberately no Drive embed viewer - that would
 * require granting the viewer Drive access, i.e. the very public sharing this
 * replaces.
 */
function isSpeculativeFetch(req: Request): boolean {
  const purpose = req.headers.get('sec-purpose') ?? req.headers.get('purpose') ?? req.headers.get('x-purpose') ?? ''
  return /prefetch|prerender|preview/i.test(purpose)
}

/** RFC 5987 disposition carrying a possibly-non-ASCII filename safely. */
function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (isSpeculativeFetch(req)) return new Response(null, { status: 204 })

  let me
  try {
    me = await requireCapabilityApi('viewClasses')
  } catch (error) {
    return authTextFail(error)
  }

  const rl = rateLimit(`attach-dl:${me.id}`, { limit: 60, windowMs: 60 * 1000 })
  if (!rl.ok) return tooManyRequestsText(undefined, rl.retryAfterSec)

  const { id } = await ctx.params
  let attachment
  try {
    attachment = await selectReadableActiveAttachment(id)
  } catch (error) {
    // A real read error (attachments table missing / RLS misconfigured) is a
    // provisioning fault, not "not found" - log it and 502 so it is observable,
    // never a silent 404 that masks a fail-open-shaped misconfiguration.
    logError('attachments.download.read', error)
    return textFail('Could not open the file. Please try again in a moment.', 502)
  }
  // Not readable (RLS), not active, or somehow lacking a file id -> identical 404,
  // never revealing which of those it was.
  if (!attachment || !attachment.drive_file_id) return notFoundText()

  let file
  try {
    file = await getDriveStorage().getFileStream(attachment.drive_file_id)
  } catch {
    return textFail('Could not open the file. Please try again in a moment.', 502)
  }

  const inline = new URL(req.url).searchParams.get('inline') === '1'
  return new Response(file.body, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', attachment.original_filename),
      // Private to this caller; never cached by a shared proxy.
      'Cache-Control': 'private, no-store',
    },
  })
}
