import { describe, it, expect } from 'vitest'
import { buildShareRequest } from '@/lib/google/driveShare'

describe('buildShareRequest', () => {
  it('POSTs an anyone-reader permission to the file', () => {
    const req = buildShareRequest('abc123', 'tok')
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://www.googleapis.com/drive/v3/files/abc123/permissions')
    expect(req.headers.Authorization).toBe('Bearer tok')
    expect(req.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(req.body)).toEqual({ role: 'reader', type: 'anyone' })
  })

  it('url-encodes the file id', () => {
    expect(buildShareRequest('a/b', 't').url).toContain('files/a%2Fb/permissions')
  })
})
