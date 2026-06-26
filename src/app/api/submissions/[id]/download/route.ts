import { Readable } from 'node:stream'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { getSubmission } from '@/lib/repos/submissions'
import { getDriveClient } from '@/lib/drive/auth'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    await requireRoleApi(['admin', 'teacher', 'student'])
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  // RLS scopes getSubmission: teacher-of-course / admin / the owning student.
  const submission = await getSubmission(ctx.params.id)
  if (!submission?.drive_file_id) return new Response('Not found', { status: 404 })

  const drive = await getDriveClient()
  const meta = await drive.files.get({ fileId: submission.drive_file_id, fields: 'name,mimeType' })
  const fileRes = await drive.files.get(
    { fileId: submission.drive_file_id, alt: 'media' },
    { responseType: 'stream' },
  )
  const webStream = Readable.toWeb(fileRes.data as unknown as Readable) as unknown as ReadableStream

  return new Response(webStream, {
    headers: {
      'Content-Type': String(meta.data.mimeType ?? 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${String(meta.data.name ?? 'submission').replace(/"/g, '')}"`,
    },
  })
}
