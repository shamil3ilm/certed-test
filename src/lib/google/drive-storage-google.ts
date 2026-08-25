import 'server-only'
import { randomUUID } from 'node:crypto'
import { googleDriveEnv } from '@/lib/env'
import type { DriveFileRef, DriveStorage } from './drive-storage'

/**
 * Real DriveStorage: the academy's dedicated Google account, reached with a
 * refresh token held as a server secret. The token is exchanged for a short-lived
 * access token (cached until shortly before it expires); everything else is plain
 * Drive v3 REST. No credential is ever sent to the browser.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  const now = Date.now()
  // Refresh a minute early so a token never expires mid-request.
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value
  const { clientId, clientSecret, refreshToken } = googleDriveEnv()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    // Google returns the actual diagnosis in the body (e.g. {"error":"invalid_grant"}),
    // which the bare status code hides. invalid_grant means the refresh token is dead -
    // most often a consent screen still in "Testing" (Google expires the token after 7
    // days) or a revoked/rotated token - so surface it: it is the whole diagnosis.
    const body = await res.text().catch(() => '')
    const reason = /invalid_grant/.test(body)
      ? 'invalid_grant (refresh token expired or revoked - re-capture it; set the OAuth consent screen to In production)'
      : body.slice(0, 300)
    throw new Error(`Drive token exchange failed: ${res.status}${reason ? ` - ${reason}` : ''}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in * 1000 }
  return json.access_token
}

function authed(token: string, extra?: HeadersInit): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...(extra ?? {}) }
}

export function googleDriveStorage(): DriveStorage {
  return {
    async ensureFolderPath(segments) {
      const token = await accessToken()
      let parent = googleDriveEnv().rootFolderId
      for (const segment of segments) {
        // Escape single quotes so a segment can't break out of the query literal.
        const safe = segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
        const q = `name = '${safe}' and '${parent}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
        const listRes = await fetch(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, {
          headers: authed(token),
        })
        if (!listRes.ok) throw new Error(`Drive folder lookup failed: ${listRes.status}`)
        const existing = ((await listRes.json()) as { files?: { id: string }[] }).files?.[0]?.id
        if (existing) {
          parent = existing
          continue
        }
        const createRes = await fetch(`${API}/files?fields=id`, {
          method: 'POST',
          headers: authed(token, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: segment, mimeType: FOLDER_MIME, parents: [parent] }),
        })
        if (!createRes.ok) throw new Error(`Drive folder create failed: ${createRes.status}`)
        parent = ((await createRes.json()) as { id: string }).id
      }
      return parent
    },

    async createFile({ name, mimeType, folderId, bytes, appProperties }) {
      const token = await accessToken()
      const boundary = `certed-${randomUUID()}`
      const metadata = { name, parents: [folderId], mimeType, appProperties }
      const enc = new TextEncoder()
      const head = enc.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      )
      const tail = enc.encode(`\r\n--${boundary}--`)
      const body = new Uint8Array(head.length + bytes.length + tail.length)
      body.set(head, 0)
      body.set(bytes, head.length)
      body.set(tail, head.length + bytes.length)
      const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: authed(token, { 'Content-Type': `multipart/related; boundary=${boundary}` }),
        body,
      })
      if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
      return { id: ((await res.json()) as { id: string }).id }
    },

    async getFileStream(fileId) {
      const token = await accessToken()
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: authed(token) })
      if (!res.ok || !res.body) throw new Error(`Drive download failed: ${res.status}`)
      const size = Number(res.headers.get('content-length'))
      return {
        body: res.body as ReadableStream<Uint8Array>,
        mimeType: res.headers.get('content-type'),
        size: Number.isFinite(size) && size > 0 ? size : null,
      }
    },

    async deleteFile(fileId) {
      const token = await accessToken()
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: authed(token),
      })
      // A file already gone is the desired end state, not an error.
      if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`)
    },

    async listFilesByAppProperty(key, value) {
      const token = await accessToken()
      // Escape single quotes so key/value can't break out of the query literal.
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const q = `appProperties has { key='${esc(key)}' and value='${esc(value)}' } and trashed = false`
      const out: DriveFileRef[] = []
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({ q, fields: 'nextPageToken, files(id, appProperties)', pageSize: '1000' })
        if (pageToken) params.set('pageToken', pageToken)
        const res = await fetch(`${API}/files?${params.toString()}`, { headers: authed(token) })
        if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)
        const json = (await res.json()) as {
          nextPageToken?: string
          files?: { id: string; appProperties?: Record<string, string> }[]
        }
        for (const file of json.files ?? []) out.push({ id: file.id, appProperties: file.appProperties ?? {} })
        pageToken = json.nextPageToken
      } while (pageToken)
      return out
    },
  }
}
