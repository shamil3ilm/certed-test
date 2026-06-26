import 'server-only'
import { randomUUID } from 'node:crypto'
import { getDriveAccessToken, getDriveClient } from './auth'
import { isMock } from '@/lib/mock/env'
import { readMockFile, deleteMockFile } from '@/lib/mock/storage'

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
  if (isMock()) {
    // Browser PUTs straight to the local mock sink; the file id is fixed up-front.
    const params = new URLSearchParams({ fileId: randomUUID(), name: opts.name, mime: opts.mimeType })
    return `/api/dev/drive-put?${params.toString()}`
  }
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
  if (isMock()) {
    const found = readMockFile(fileId)
    return found
      ? { size: found.meta.size, mimeType: found.meta.mimeType, name: found.meta.name }
      : { size: 1024, mimeType: 'application/pdf', name: 'mock' }
  }
  const drive = await getDriveClient()
  const { data } = await drive.files.get({ fileId, fields: 'id,name,size,mimeType' })
  return {
    size: Number(data.size ?? 0),
    mimeType: String(data.mimeType ?? ''),
    name: String(data.name ?? ''),
  }
}

export async function trashFile(fileId: string): Promise<void> {
  if (isMock()) { deleteMockFile(fileId); return }
  const drive = await getDriveClient()
  await drive.files.update({ fileId, requestBody: { trashed: true } })
}
