import 'server-only'
import { Readable } from 'node:stream'
import { getDriveClient } from './auth'
import { isMock } from '@/lib/mock/env'
import { readMockFile, placeholderPdf } from '@/lib/mock/storage'

/** Streams a Drive file as an attachment Response (access-check at the call site). */
export async function streamDriveFile(fileId: string, fallbackName = 'file'): Promise<Response> {
  if (isMock()) {
    const found = readMockFile(fileId)
    const body = found ? found.buffer : placeholderPdf(`Mock document: ${fileId}`)
    const mime = found ? found.meta.mimeType : 'application/pdf'
    const name = found ? found.meta.name : `${fileId}.pdf`
    const stream = Readable.toWeb(Readable.from(body)) as unknown as ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
      },
    })
  }
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
