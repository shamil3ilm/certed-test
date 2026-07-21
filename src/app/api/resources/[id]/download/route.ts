import { forbiddenText, notFoundText, tooManyRequestsText } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/require-role'
import { getResource } from '@/lib/services/resources'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * Resources are Google Drive links. This route is an access-checked indirection:
 * it verifies the caller may see the resource (role + RLS) and then redirects to
 * the link, so the raw Drive URL isn't exposed until an authorized click.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  let me
  try {
    // Mentor included at the coarse gate; getResource stays RLS-scoped, so a
    // mentor only resolves a resource their policy actually grants (e.g. when they
    // also tutor the class) and gets a clean 404 otherwise.
    me = await requireRoleApi(['admin', 'tutor', 'mentor', 'student'])
  } catch {
    return forbiddenText()
  }

  const rl = rateLimit(`resource:${me.id}`, { limit: 20, windowMs: 60 * 1000 })
  if (!rl.ok) return tooManyRequestsText(undefined, rl.retryAfterSec)

  // getResource uses the caller's RLS-scoped client - null unless they may see it.
  const resource = await getResource(ctx.params.id)
  if (!resource || resource.status !== 'active' || !resource.drive_link) {
    return notFoundText()
  }
  return Response.redirect(resource.drive_link, 302)
}
