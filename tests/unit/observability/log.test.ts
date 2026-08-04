import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { logError } from '@/lib/observability/log'

afterEach(() => vi.restoreAllMocks())

describe('logError', () => {
  it('prefixes the context and forwards meta', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('writeAudit', new Error('boom'), { action: 'user.revoke' })
    expect(spy).toHaveBeenCalledTimes(1)
    const [msg, detail] = spy.mock.calls[0]
    expect(msg).toBe('[writeAudit] boom')
    expect(detail).toMatchObject({ action: 'user.revoke', stack: expect.stringContaining('boom') })
  })

  it('stringifies a non-Error value and omits stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('apiError', 'plain string')
    const [msg, detail] = spy.mock.calls[0]
    expect(msg).toBe('[apiError] plain string')
    expect(detail).not.toHaveProperty('stack')
  })
})
