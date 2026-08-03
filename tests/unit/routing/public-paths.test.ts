import { describe, it, expect } from 'vitest'
import { isPublicAppPath, PUBLIC_APP_PATHS } from '@/lib/routing/public-paths'

describe('isPublicAppPath', () => {
  it('matches every exact public path', () => {
    for (const p of PUBLIC_APP_PATHS) expect(isPublicAppPath(p)).toBe(true)
  })

  it('does NOT treat a look-alike of a public path as public', () => {
    // The bug this fixes: a bare startsWith('/login') also matched these.
    expect(isPublicAppPath('/loginx')).toBe(false)
    expect(isPublicAppPath('/login-secret')).toBe(false)
    expect(isPublicAppPath('/registeree')).toBe(false)
    expect(isPublicAppPath('/api/healthz')).toBe(false)
    expect(isPublicAppPath('/api/health-check')).toBe(false)
  })

  it('keeps exact page paths exact - a sub-path is not public', () => {
    expect(isPublicAppPath('/login/anything')).toBe(false)
    expect(isPublicAppPath('/register/step-2')).toBe(false)
  })

  it('treats the /api/cron prefix and its sub-routes as public', () => {
    expect(isPublicAppPath('/api/cron')).toBe(true)
    expect(isPublicAppPath('/api/cron/keepalive')).toBe(true)
    // ...but not a look-alike that merely starts with the same letters.
    expect(isPublicAppPath('/api/cronjob')).toBe(false)
  })

  it('does not treat protected paths as public', () => {
    for (const p of ['/dashboard', '/classroom/123', '/api/receipts', '/api/logout', '/students/1']) {
      expect(isPublicAppPath(p)).toBe(false)
    }
  })
})
