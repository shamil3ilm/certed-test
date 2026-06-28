import { Readable } from 'node:stream'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { getResource } from '@/lib/repos/resources'
import { getDriveClient } from '@/lib/drive/auth'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  // Blocks disabled/non-allowlisted users; RLS (below) enforces course scope.
  try {
    await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }

  // getResource uses the caller's RLS-scoped client → null unless they may see it.
  const resource = await getResource(ctx.params.id)
  if (!resource || resource.status !== 'active') {
    return new Response('Not found', { status: 404 })
  }

  // If it's a direct URL/link resource (no Drive file id), redirect directly
  if (!resource.drive_file_id && resource.drive_link) {
    return Response.redirect(resource.drive_link, 302)
  }

  if (!resource.drive_file_id) {
    return new Response('Not found', { status: 404 })
  }

  const drive = await getDriveClient()
  const meta = await drive.files.get({ fileId: resource.drive_file_id, fields: 'name,mimeType' })
  const fileRes = await drive.files.get(
    { fileId: resource.drive_file_id, alt: 'media' },
    { responseType: 'stream' },
  )
  const webStream = Readable.toWeb(fileRes.data as unknown as Readable) as unknown as ReadableStream

  return new Response(webStream, {
    headers: {
      'Content-Type': String(meta.data.mimeType ?? 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${String(meta.data.name ?? 'file').replace(/"/g, '')}"`,
    },
  })
}
