import { authTextFail, notFoundText, tooManyRequestsText, textFail } from '@/lib/api/response'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { recordDownload } from '@/lib/services/resources'
import { NotFoundError, PermissionError } from '@/lib/errors'
import { rateLimit } from '@/lib/security/rate-limit'
import { isAllowedDriveUrl } from '@/lib/drive-link'
import { listAttachmentRowsForOwner } from '@/lib/services/attachments/read'
import { getDriveStorage } from '@/lib/google/drive-storage'

// Node runtime: a custodial document streams its bytes from the Drive REST API.
export const runtime = 'nodejs'

/** A speculative browser fetch (link prefetch / preview) advertises itself in one
 *  of these headers. Such a request must not count as a real download. */
function isSpeculativeFetch(req: Request): boolean {
  const purpose = req.headers.get('sec-purpose') ?? req.headers.get('purpose') ?? req.headers.get('x-purpose') ?? ''
  return /prefetch|prerender|preview/i.test(purpose)
}

/**
 * Documents are Google Drive links. This route is an access-checked indirection:
 * it enforces the document RBAC (canDocument 'download' - so a student is blocked
 * on a staff-only file), records the download (count + audit),
 * then redirects to the link, so the raw Drive URL isn't exposed until an
 * authorized click. A denied/missing document returns 404 either way, so the
 * route never reveals which of the two it was.
 */
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
  // A LINK document redirects to Drive as before. Defence in depth: re-verify the
  // host at redirect time so the target can't escape the Drive/Docs allowlist even
  // if bad data reached the row. no-store: the URL has a side effect.
  if (doc.drive_link) {
    if (!isAllowedDriveUrl(doc.drive_link)) return notFoundText()
    return new Response(null, { status: 302, headers: { Location: doc.drive_link, 'Cache-Control': 'no-store' } })
  }

  // A CUSTODIAL document has no link: stream its attachment's bytes through the app,
  // private, exactly like the attachment download route. recordDownload above has
  // already run the per-document permission check, so the file may be served.
  const [attachment] = await listAttachmentRowsForOwner({ kind: 'resource', id: doc.id })
  if (!attachment || !attachment.drive_file_id) return notFoundText()
  let file
  try {
    file = await getDriveStorage().getFileStream(attachment.drive_file_id)
  } catch {
    return textFail('Could not open the document. Please try again in a moment.', 502)
  }
  const inline = new URL(req.url).searchParams.get('inline') === '1'
  const ascii = attachment.original_filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return new Response(file.body, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(attachment.original_filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
