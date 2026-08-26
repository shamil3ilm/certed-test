import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertNoMockConfigInProduction } from '@/lib/mock/env'

// The guard reads process.env directly, so snapshot + restore the keys it touches.
const KEYS = [
  'VERCEL_ENV',
  'MOCK_MODE',
  'NEXT_PUBLIC_MOCK_MODE',
  'ALLOW_MOCK_AUTH',
  'MOCK_PASSWORD',
  'MOCK_CHROME_PATH',
]
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('assertNoMockConfigInProduction', () => {
  it('throws when a mock var is enabling in a Vercel production deployment', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.ALLOW_MOCK_AUTH = '1'
    expect(() => assertNoMockConfigInProduction()).toThrow(/Mock-only env var/)
  })

  it('names every enabling mock var it finds', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MOCK_MODE = '1'
    process.env.MOCK_PASSWORD = 'cert-ed'
    expect(() => assertNoMockConfigInProduction()).toThrow(/MOCK_MODE.*MOCK_PASSWORD|MOCK_PASSWORD.*MOCK_MODE/)
  })

  it('ignores an explicitly-disabled mock var (0 / false / empty) in production', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.MOCK_MODE = '0'
    process.env.ALLOW_MOCK_AUTH = 'false'
    process.env.NEXT_PUBLIC_MOCK_MODE = ''
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })

  it('does NOT fire outside Vercel production - the local E2E mock build (no VERCEL_ENV)', () => {
    // The E2E build sets MOCK_MODE + ALLOW_MOCK_AUTH but has no VERCEL_ENV.
    process.env.MOCK_MODE = '1'
    process.env.ALLOW_MOCK_AUTH = '1'
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })

  it('does NOT fire on a Vercel preview deployment (mock is allowed there)', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.MOCK_MODE = '1'
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })

  it('passes clean when production carries no mock vars', () => {
    process.env.VERCEL_ENV = 'production'
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })
})
