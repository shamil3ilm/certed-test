import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/observability/log'
import { rateLimitShared } from '@/lib/security/rate-limit-shared'

const clientWithRpc = (result: { data?: unknown; error?: unknown }) => ({ rpc: vi.fn(async () => result) })

beforeEach(() => vi.resetAllMocks())

describe('rateLimitShared', () => {
  it('allows when the RPC reports allowed', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      clientWithRpc({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }) as any,
    )
    expect(await rateLimitShared('k', { limit: 5, windowSeconds: 600 })).toEqual({ ok: true, retryAfterSec: 0 })
  })

  it('blocks and forwards retry-after when over the limit', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      clientWithRpc({ data: [{ allowed: false, retry_after_seconds: 42 }], error: null }) as any,
    )
    expect(await rateLimitShared('k', { limit: 5, windowSeconds: 600 })).toEqual({ ok: false, retryAfterSec: 42 })
  })

  it('passes the key, limit and window through to the RPC', async () => {
    const client = clientWithRpc({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await rateLimitShared('contact:1.2.3.4', { limit: 5, windowSeconds: 600 })
    expect(client.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'contact:1.2.3.4',
      p_limit: 5,
      p_window_seconds: 600,
    })
  })

  it('degrades to the in-process limiter (allows the first hit) + logs on a store error', async () => {
    vi.mocked(createAdminClient).mockReturnValue(clientWithRpc({ data: null, error: { message: 'db down' } }) as any)
    expect(await rateLimitShared('err-first', { limit: 5, windowSeconds: 600 })).toEqual({ ok: true, retryAfterSec: 0 })
    expect(logError).toHaveBeenCalled()
  })

  it('degrades to the in-process limiter + logs when the client throws', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('boom')
    })
    expect(await rateLimitShared('throw-first', { limit: 5, windowSeconds: 600 })).toEqual({
      ok: true,
      retryAfterSec: 0,
    })
    expect(logError).toHaveBeenCalled()
  })

  it('does NOT allow unlimited when the RPC is missing - the fallback still enforces a ceiling', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      clientWithRpc({ data: null, error: { code: 'PGRST202', message: 'could not find the function' } }) as any,
    )
    const key = `missing-rpc-${Date.now()}` // unique so the shared in-process bucket is fresh
    const call = () => rateLimitShared(key, { limit: 2, windowSeconds: 600 })
    expect((await call()).ok).toBe(true) // 1
    expect((await call()).ok).toBe(true) // 2
    const third = await call() // over the ceiling
    expect(third.ok).toBe(false)
    expect(third.retryAfterSec).toBeGreaterThan(0)
    // and it flagged the missing RPC distinctly
    expect(vi.mocked(logError).mock.calls.some((c) => c[0] === 'rateLimitShared:rpc-missing')).toBe(true)
  })
})
