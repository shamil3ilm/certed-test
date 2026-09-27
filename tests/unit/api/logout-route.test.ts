import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/mock/env', () => ({ isMock: () => true }))
vi.mock('@/lib/mock/session', () => ({ MOCK_COOKIE: 'mock-session' }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { POST } from '@/app/api/logout/route'

/**
 * Sign-out answers a <form method="post">, so the redirect status is not cosmetic: 307 (the
 * NextResponse default) preserves the method, and the browser would re-POST to /login - a page
 * route, which answers 405. 303 is "your POST is done, GET this instead".
 */
describe('POST /api/logout', () => {
  it('redirects to /login with 303 so the browser follows it as a GET', async () => {
    const res = await POST(new Request('https://app.local/api/logout', { method: 'POST' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://app.local/login')
  })
})
