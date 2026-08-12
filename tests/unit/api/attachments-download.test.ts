import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/require-role', () => ({ requireCapabilityApi: vi.fn() }))
vi.mock('@/lib/data/attachments', () => ({ selectReadableActiveAttachment: vi.fn() }))
vi.mock('@/lib/google/drive-storage', () => ({ getDriveStorage: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: vi.fn(() => ({ ok: true })) }))

import { GET } from '@/app/api/attachments/[id]/download/route'
import { requireCapabilityApi } from '@/lib/auth/require-role'
import { selectReadableActiveAttachment } from '@/lib/data/attachments'
import { getDriveStorage } from '@/lib/google/drive-storage'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url = 'http://app.localhost/api/attachments/a1/download', headers: Record<string, string> = {}) =>
  new Request(url, { headers })

function drive(body: ReadableStream, mimeType = 'application/pdf') {
  return { getFileStream: vi.fn().mockResolvedValue({ body, mimeType, size: 100 }) } as never
}

beforeEach(() => vi.resetAllMocks())

describe('GET /api/attachments/[id]/download', () => {
  it('answers a speculative prefetch with 204 and no work', async () => {
    const res = await GET(req(undefined, { 'sec-purpose': 'prefetch' }), ctx('a1'))
    expect(res.status).toBe(204)
    expect(requireCapabilityApi).not.toHaveBeenCalled()
  })

  it('401 when unauthenticated', async () => {
    vi.mocked(requireCapabilityApi).mockRejectedValue(new Error('no-access'))
    expect((await GET(req(), ctx('a1'))).status).toBe(401)
  })

  it('404 when the attachment is not readable (RLS returns nothing)', async () => {
    vi.mocked(requireCapabilityApi).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(selectReadableActiveAttachment).mockResolvedValue(null)
    expect((await GET(req(), ctx('a1'))).status).toBe(404)
  })

  it('streams the bytes with content headers when readable', async () => {
    vi.mocked(requireCapabilityApi).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(selectReadableActiveAttachment).mockResolvedValue({
      id: 'a1',
      drive_file_id: 'd1',
      mime_type: 'application/pdf',
      original_filename: 'Essay.pdf',
    } as never)
    vi.mocked(getDriveStorage).mockReturnValue(drive(new ReadableStream()))

    const res = await GET(req(), ctx('a1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain("filename*=UTF-8''Essay.pdf")
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('uses inline disposition for ?inline=1 (preview)', async () => {
    vi.mocked(requireCapabilityApi).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(selectReadableActiveAttachment).mockResolvedValue({
      id: 'a1',
      drive_file_id: 'd1',
      mime_type: 'image/png',
      original_filename: 'x.png',
    } as never)
    vi.mocked(getDriveStorage).mockReturnValue(drive(new ReadableStream(), 'image/png'))

    const res = await GET(req('http://app.localhost/api/attachments/a1/download?inline=1'), ctx('a1'))
    expect(res.headers.get('content-disposition')).toContain('inline')
  })
})
