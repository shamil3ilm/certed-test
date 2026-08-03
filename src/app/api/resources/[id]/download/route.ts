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
export async function GET(_req: Request, ctx: { params: { id: string } }) {
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
    doc = await recordDownload(me, ctx.params.id)
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof PermissionError) return notFoundText()
    return textFail('Could not open the document. Please try again in a moment.', 502)
  }
  // Defence in depth: re-verify the host at redirect time, so even a legacy row
  // stored before the write-time allowlist can't turn this into an open redirect
  // to an arbitrary host. The write schema now blocks non-Drive links.
  if (!doc.drive_link || !isAllowedDriveUrl(doc.drive_link)) return notFoundText()
  return Response.redirect(doc.drive_link, 302)
}
