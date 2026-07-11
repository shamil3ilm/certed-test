import { requireRoleApi } from '@/lib/auth/requireRole'
import { getResource } from '@/lib/repos/resources'

/**
 * Resources are Google Drive links. This route is an access-checked indirection:
 * it verifies the caller may see the resource (role + RLS) and then redirects to
 * the link, so the raw Drive URL isn't exposed until an authorized click.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  // getResource uses the caller's RLS-scoped client → null unless they may see it.
  const resource = await getResource(ctx.params.id)
  if (!resource || resource.status !== 'active' || !resource.drive_link) {
    return new Response('Not found', { status: 404 })
  }
  return Response.redirect(resource.drive_link, 302)
}
