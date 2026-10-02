import { describe, it, expect, afterEach } from 'vitest'
import { cronAuthFailure } from '@/lib/api/cron-auth'

const request = (authorization?: string) =>
  new Request('https://app.example.test/api/cron/anything', {
    headers: authorization ? { authorization } : {},
  })

const SECRET = 'a-cron-secret'
const original = process.env.CRON_SECRET
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original
})

describe('cronAuthFailure', () => {
  it('lets the scheduler through when the bearer token matches', () => {
    process.env.CRON_SECRET = SECRET
    expect(cronAuthFailure(request(`Bearer ${SECRET}`))).toBeNull()
  })

  it('refuses a wrong secret with 401', async () => {
    process.env.CRON_SECRET = SECRET
    const denied = cronAuthFailure(request('Bearer not-the-secret'))
    expect(denied?.status).toBe(401)
  })

  it('refuses a missing header', () => {
    process.env.CRON_SECRET = SECRET
    expect(cronAuthFailure(request())?.status).toBe(401)
  })

  it('refuses a bare token without the Bearer prefix', () => {
    process.env.CRON_SECRET = SECRET
    expect(cronAuthFailure(request(SECRET))?.status).toBe(401)
  })

  it('FAILS CLOSED when CRON_SECRET is unset - an unconfigured deployment is not a public one', () => {
    delete process.env.CRON_SECRET
    expect(cronAuthFailure(request('Bearer anything'))?.status).toBe(401)
    expect(cronAuthFailure(request())?.status).toBe(401)
  })

  it('does not throw on a length mismatch, which is what timingSafeEqual does unguarded', () => {
    process.env.CRON_SECRET = SECRET
    expect(() => cronAuthFailure(request('Bearer x'))).not.toThrow()
  })
})
