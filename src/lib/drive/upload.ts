import 'server-only'
import { Readable } from 'node:stream'
import { getDriveClient } from './auth'

/** Uploads a server-generated buffer (e.g. a rendered PDF) directly to Drive. */
export async function uploadBuffer(
  folderId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ fileId: string; link: string | null }> {
  const drive = await getDriveClient()
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId], mimeType },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  })
  return { fileId: res.data.id as string, link: (res.data.webViewLink as string) ?? null }
}
