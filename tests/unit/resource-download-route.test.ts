import { describe, it, expect, vi, beforeEach } from 'vitest'

// The download GET has a side effect (download count + audit), so a speculative
// browser fetch (prefetch/preview) must not trigger it.
vi.mock('@/lib/auth/require-role', () => ({ requireCapabilityApi: vi.fn() }))
vi.mock('@/lib/services/resources', () => ({ recordDownload: vi.fn() }))

import { requireCapabilityApi } from '@/lib/auth/require-role'
import { recordDownload } from '@/lib/services/resources'
import { GET } from '@/app/api/resources/[id]/download/route'

const req = (headers: Record<string, string> = {}) =>
  new Request('http://app.test/api/resources/res-1/download', { headers })

beforeEach(() => vi.resetAllMocks())

describe('GET /api/resources/[id]/download prefetch guard', () => {
  it('answers 204 and records nothing for a prefetch (sec-purpose)', async () => {
    const res = await GET(req({ 'sec-purpose': 'prefetch' }), { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(204)
    expect(requireCapabilityApi).not.toHaveBeenCalled()
    expect(recordDownload).not.toHaveBeenCalled()
  })

  it('also skips a legacy Purpose: prefetch header', async () => {
    const res = await GET(req({ purpose: 'prefetch' }), { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).toBe(204)
    expect(recordDownload).not.toHaveBeenCalled()
  })

  it('proceeds to the auth gate for a genuine request (no prefetch header)', async () => {
    // requireCapabilityApi rejects -> route returns an auth failure, but the point
    // is that the guard let it through to auth rather than short-circuiting at 204.
    vi.mocked(requireCapabilityApi).mockRejectedValueOnce(new Error('no-access'))
    const res = await GET(req(), { params: Promise.resolve({ id: 'res-1' }) })
    expect(res.status).not.toBe(204)
    expect(requireCapabilityApi).toHaveBeenCalledWith('viewClasses')
  })
})
