import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }))
vi.mock('@/lib/routing/host', () => ({ resolveHost: vi.fn(() => 'app') }))

import { proxy } from '@/proxy'
import { updateSession } from '@/lib/supabase/middleware'
import { resolveHost } from '@/lib/routing/host'

const ENV = process.env
const req = (path: string, host = 'app.local') => new NextRequest(`https://${host}${path}`, { headers: { host } })
const location = (res: Response) => res.headers.get('location')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveHost).mockReturnValue('app')
  process.env = {
    ...ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'http://mock.local',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock-anon',
    PORTAL_ONLY: '1', // force the app host so we exercise the auth gate directly
  }
})
afterEach(() => {
  process.env = ENV
})

describe('middleware auth gate', () => {
  it('stays dormant (passes through) until Supabase env is configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const res = await proxy(req('/dashboard'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
    expect(updateSession).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated user off a protected path to /login', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/dashboard'))
    expect(location(res)).toMatch(/\/login$/)
  })

  it('lets an authenticated user reach a protected path', async () => {
    vi.mocked(updateSession).mockResolvedValue({ id: 'u1' } as any)
    const res = await proxy(req('/dashboard'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })

  it('lets an unauthenticated user reach an EXACT public path', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/login'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })

  it('does NOT treat a public look-alike as public', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/loginx'))
    expect(location(res)).toMatch(/\/login$/)
  })

  it('bounces an authenticated user off /login to the dashboard', async () => {
    vi.mocked(updateSession).mockResolvedValue({ id: 'u1' } as any)
    const res = await proxy(req('/login'))
    expect(location(res)).toMatch(/\/dashboard$/)
  })

  it('routes root by auth state', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    expect(location(await proxy(req('/')))).toMatch(/\/login$/)
    vi.mocked(updateSession).mockResolvedValue({ id: 'u1' } as any)
    expect(location(await proxy(req('/')))).toMatch(/\/dashboard$/)
  })

  it('lets a public API sub-route under a prefix through (/api/cron/keepalive)', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/api/cron/keepalive'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })

  it('answers an unauthenticated API write with a 401 JSON, not an HTML /login redirect', async () => {
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/api/receipts'))
    expect(res.status).toBe(401)
    expect(location(res)).toBeNull() // not a redirect
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: expect.any(String),
      code: 'UNAUTHORIZED',
    })
  })

  it('carries the refreshed session cookies + CSP header across a redirect (NEW-24)', async () => {
    // updateSession rotates the Supabase token and writes it onto the response; a
    // redirect that discarded it would leave the browser holding the old token and
    // log the user out on the next request.
    vi.mocked(updateSession).mockImplementation(async (_req, res: any) => {
      res.cookies.set('sb-access-token', 'refreshed', { path: '/' })
      return null
    })
    const res = await proxy(req('/dashboard'))
    expect(location(res)).toMatch(/\/login$/) // it IS the redirect branch
    expect(res.cookies.get('sb-access-token')?.value).toBe('refreshed') // ...and it kept the cookie
    expect(res.headers.get('content-security-policy')).toBeTruthy() // ...and the CSP header
  })
})

describe('middleware host routing', () => {
  it('redirects a marketing path off the app host to the marketing host', async () => {
    process.env.PORTAL_ONLY = '0'
    process.env.MARKETING_HOSTNAME = 'marketing.example'
    vi.mocked(resolveHost).mockReturnValue('app')
    vi.mocked(updateSession).mockResolvedValue(null as any)
    const res = await proxy(req('/about'))
    expect(location(res)).toContain('marketing.example')
  })
})
