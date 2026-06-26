import 'server-only'
import { Readable } from 'node:stream'
import { getDriveClient } from './auth'
import { isMock } from '@/lib/mock/env'
import { writeMockFile } from '@/lib/mock/storage'

/** Uploads a server-generated buffer (e.g. a rendered PDF) directly to Drive. */
export async function uploadBuffer(
  folderId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ fileId: string; link: string | null }> {
  if (isMock()) {
    const fileId = writeMockFile(buffer, { mimeType, name, size: buffer.length })
    return { fileId, link: '#' }
  }
  const drive = await getDriveClient()
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId], mimeType },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  })
  return { fileId: res.data.id as string, link: (res.data.webViewLink as string) ?? null }
}
