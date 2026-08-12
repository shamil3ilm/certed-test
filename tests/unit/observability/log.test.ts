import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  // logError reads the request id back off the isolation scope for its log field.
  getIsolationScope: () => ({ getScopeData: () => ({ tags: {} }) }),
}))

import { logError } from '@/lib/observability/log'
import * as Sentry from '@sentry/nextjs'

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

  it('forwards to Sentry by default but not when toSentry:false (benign best-effort miss)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(Sentry.captureException).mockClear()
    logError('apiError', new Error('real'))
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    logError('notifyBestEffort', new Error('benign'), {}, { toSentry: false })
    expect(Sentry.captureException).toHaveBeenCalledTimes(1) // unchanged - benign miss skipped
  })
})
