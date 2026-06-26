import 'server-only'
import { Readable } from 'node:stream'
import { getDriveClient } from './auth'

/** Streams a Drive file as an attachment Response (access-check at the call site). */
export async function streamDriveFile(fileId: string, fallbackName = 'file'): Promise<Response> {
  const drive = await getDriveClient()
  const meta = await drive.files.get({ fileId, fields: 'name,mimeType' })
  const fileRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  const webStream = Readable.toWeb(fileRes.data as unknown as Readable) as unknown as ReadableStream
  return new Response(webStream, {
    headers: {
      'Content-Type': String(meta.data.mimeType ?? 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${String(meta.data.name ?? fallbackName).replace(/"/g, '')}"`,
    },
  })
}
