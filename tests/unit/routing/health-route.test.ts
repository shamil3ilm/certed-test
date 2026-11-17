import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { pingDatabase } = vi.hoisted(() => ({ pingDatabase: vi.fn() }))
vi.mock('@/lib/data/org-settings', () => ({ pingDatabase }))

beforeEach(() => {
  vi.resetModules() // give each test a fresh module-level ping memo
  pingDatabase.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

describe('GET /api/health', () => {
  it('memoises the DB ping within the TTL, then re-pings past it', async () => {
    pingDatabase.mockResolvedValue(true)
    const { GET } = await import('@/app/api/health/route')

    await GET()
    await GET()
    await GET()
    expect(pingDatabase).toHaveBeenCalledTimes(1) // a burst collapses to one round-trip

    vi.setSystemTime(31_000) // past the 30s window
    const res = await GET()
    expect(pingDatabase).toHaveBeenCalledTimes(2) // a normal pinger still keeps the DB warm
    await expect(res.json()).resolves.toEqual({ ok: true, db: true })
  })

  it('reports db:false when the ping fails, and never throws', async () => {
    pingDatabase.mockRejectedValue(new Error('down'))
    const { GET } = await import('@/app/api/health/route')

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, db: false })
  })

  it('sets no-store so a CDN never caches the liveness probe', async () => {
    pingDatabase.mockResolvedValue(true)
    const { GET } = await import('@/app/api/health/route')

    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/health/live', () => {
  it('returns 200 live without querying database', async () => {
    const { GET } = await import('@/app/api/health/live/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    await expect(res.json()).resolves.toEqual({ ok: true, status: 'live' })
    expect(pingDatabase).not.toHaveBeenCalled()
  })
})

describe('GET /api/health/ready', () => {
  it('returns 200 ready when database is live', async () => {
    pingDatabase.mockResolvedValue(true)
    const { GET } = await import('@/app/api/health/ready/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.status).toBe('ready')
    expect(data.db).toBe(true)
    expect(typeof data.latencyMs).toBe('number')
    expect(typeof data.checkedAt).toBe('string')
    expect(pingDatabase).toHaveBeenCalledTimes(1)
  })

  it('returns 503 degraded when database is down', async () => {
    pingDatabase.mockRejectedValue(new Error('connection timeout'))
    const { GET } = await import('@/app/api/health/ready/route')
    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const data = await res.json()
    expect(data.ok).toBe(false)
    expect(data.status).toBe('degraded')
    expect(data.db).toBe(false)
  })
})
