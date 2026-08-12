import { describe, it, expect, vi, beforeEach } from 'vitest'

const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: () => headersMock() }))

// A stateful isolation-scope stand-in so setTag/getScopeData share one tag bag.
const tags: Record<string, unknown> = {}
vi.mock('@sentry/nextjs', () => ({
  getIsolationScope: () => ({
    setTag: (key: string, value: unknown) => {
      tags[key] = value
    },
    getScopeData: () => ({ tags }),
  }),
}))

import { getRequestId, tagRequestScope, currentRequestId } from '@/lib/observability/request-context'

beforeEach(() => {
  for (const key of Object.keys(tags)) delete tags[key]
  headersMock.mockReset()
})

describe('request-context', () => {
  it('reads x-vercel-id from the request headers', async () => {
    headersMock.mockResolvedValue({ get: (k: string) => (k === 'x-vercel-id' ? 'iad1::abc' : null) })
    await expect(getRequestId()).resolves.toBe('iad1::abc')
  })

  it('returns null outside a request scope (headers() throws)', async () => {
    headersMock.mockRejectedValue(new Error('called outside a request scope'))
    await expect(getRequestId()).resolves.toBeNull()
  })

  it('returns null when the header is absent (non-Vercel host)', async () => {
    headersMock.mockResolvedValue({ get: () => null })
    await expect(getRequestId()).resolves.toBeNull()
  })

  it('tags the isolation scope with the id, readable back synchronously', async () => {
    headersMock.mockResolvedValue({ get: () => 'iad1::xyz' })
    await tagRequestScope()
    expect(currentRequestId()).toBe('iad1::xyz')
  })

  it('does not tag the scope when there is no id', async () => {
    headersMock.mockResolvedValue({ get: () => null })
    await tagRequestScope()
    expect(currentRequestId()).toBeUndefined()
  })
})
