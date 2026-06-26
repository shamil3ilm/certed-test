import 'server-only'
import { getDriveAccessToken, getDriveClient } from './auth'

const RESUMABLE_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id'

/**
 * Opens a Drive resumable upload session and returns the single-use session URI.
 * The browser PUTs the file bytes directly to this URI — the token never leaves
 * the server. The returned file id is read back at finalize via {@link readFileMeta}.
 */
export async function initResumableSession(opts: {
  name: string
  mimeType: string
  parentId: string
  size?: number
}): Promise<string> {
  const token = await getDriveAccessToken()
  const res = await fetch(RESUMABLE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mimeType,
      ...(opts.size ? { 'X-Upload-Content-Length': String(opts.size) } : {}),
    },
    body: JSON.stringify({ name: opts.name, mimeType: opts.mimeType, parents: [opts.parentId] }),
  })
  if (!res.ok) throw new Error(`resumable init failed: ${res.status}`)
  const sessionUri = res.headers.get('location')
  if (!sessionUri) throw new Error('resumable init: no session URI returned')
  return sessionUri
}

/** Reads back a finalized file's metadata for server-side validation. */
export async function readFileMeta(
  fileId: string,
): Promise<{ size: number; mimeType: string; name: string }> {
  const drive = await getDriveClient()
  const { data } = await drive.files.get({ fileId, fields: 'id,name,size,mimeType' })
  return {
    size: Number(data.size ?? 0),
    mimeType: String(data.mimeType ?? ''),
    name: String(data.name ?? ''),
  }
}

export async function trashFile(fileId: string): Promise<void> {
  const drive = await getDriveClient()
  await drive.files.update({ fileId, requestBody: { trashed: true } })
}
