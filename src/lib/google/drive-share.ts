export type ShareRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/** Build the Drive REST call that makes a file readable by anyone with the link. */
export function buildShareRequest(fileId: string, accessToken: string): ShareRequest {
  return {
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  }
}

/** Share the file; throws on a non-2xx response. */
export async function shareAnyoneWithLink(fileId: string, accessToken: string): Promise<void> {
  const req = buildShareRequest(fileId, accessToken)
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
  if (!res.ok) throw new Error(`Drive share failed: ${res.status}`)
}
