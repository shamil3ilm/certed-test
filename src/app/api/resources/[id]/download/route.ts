import { authTextFail, notFoundText, tooManyRequestsText, textFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { recordDownload } from '@/lib/services/resources'
import { NotFoundError, PermissionError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { isAllowedDriveUrl } from '@/lib/drive-link'

/**
 * Documents are Google Drive links. This route is an access-checked indirection:
 * it enforces the document RBAC (canDocument 'download' - so a student is blocked
 * on a staff-only file), records the download (count + audit),
 * then redirects to the link, so the raw Drive URL isn't exposed until an
 * authorized click. A denied/missing document returns 404 either way, so the
 * route never reveals which of the two it was.
 */
/** A speculative browser fetch (link prefetch / preview) advertises itself in one
 *  of these headers. Such a request must not count as a real download. */
function isSpeculativeFetch(req: Request): boolean {
  const purpose = req.headers.get('sec-purpose') ?? req.headers.get('purpose') ?? req.headers.get('x-purpose') ?? ''
  return /prefetch|prerender|preview/i.test(purpose)
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // This GET has a side effect (the download counter + audit), so a prefetch or
  // link-preview must not trigger it - only a real click should. Answer 204 and
  // record nothing.
  if (isSpeculativeFetch(req)) return new Response(null, { status: 204 })

  let me
  try {
    // Coarse gate: the same resolved `viewClasses` that opens the class workspace
    // governs direct downloads. recordDownload's canDocument check then narrows to
    // the specific document (visibility + class relationship).
    me = await requireCapabilityApi('viewClasses')
  } catch (error) {
    return authTextFail(error)
  }

  const rl = rateLimit(`resource:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
  if (!rl.ok) return tooManyRequestsText(undefined, rl.retryAfterSec)

  let doc
  try {
    doc = await recordDownload(me, (await ctx.params).id)
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof PermissionError) return notFoundText()
    return textFail('Could not open the document. Please try again in a moment.', 502)
  }
  // Defence in depth: re-verify the host at redirect time, so the redirect
  // target cannot escape the Drive/Docs allowlist even if bad data reaches the
  // row.
  if (!doc.drive_link || !isAllowedDriveUrl(doc.drive_link)) return notFoundText()
  // no-store: the URL has a side effect, so it must never be cached or replayed.
  return new Response(null, { status: 302, headers: { Location: doc.drive_link, 'Cache-Control': 'no-store' } })
}
