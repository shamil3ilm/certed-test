import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { assertNoMockConfigInProduction, MOCK_ONLY_ENV_VARS } from '@/lib/mock/env'

// The guard reads process.env directly, so snapshot + restore the keys it touches.
const KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'E2E_BUILD',
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
  // Production-like by default; sanctioned contexts are opted into per-test. NODE_ENV
  // is typed read-only, so stub it via vitest rather than assigning process.env.
  vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => {
  vi.unstubAllEnvs()
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

  it('FIRES on a self-hosted production build - NODE_ENV=production, no VERCEL_ENV, no E2E_BUILD', () => {
    // This is the deployment the old VERCEL_ENV-only guard let slip through, and the
    // exact one where isMock() would still activate the bypass via ALLOW_MOCK_AUTH=1.
    process.env.MOCK_MODE = '1'
    process.env.ALLOW_MOCK_AUTH = '1'
    expect(() => assertNoMockConfigInProduction()).toThrow(/Mock-only env var/)
  })

  it('names every enabling mock var it finds', () => {
    process.env.MOCK_MODE = '1'
    process.env.MOCK_PASSWORD = 'cert-ed'
    expect(() => assertNoMockConfigInProduction()).toThrow(/MOCK_MODE.*MOCK_PASSWORD|MOCK_PASSWORD.*MOCK_MODE/)
  })

  it('ignores an explicitly-disabled mock var (0 / false / empty) in production', () => {
    process.env.MOCK_MODE = '0'
    process.env.ALLOW_MOCK_AUTH = 'false'
    process.env.NEXT_PUBLIC_MOCK_MODE = ''
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })

  it('does NOT fire in local dev (NODE_ENV !== production) even with mock vars', () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.MOCK_MODE = '1'
    process.env.ALLOW_MOCK_AUTH = '1'
    expect(() => assertNoMockConfigInProduction()).not.toThrow()
  })

  it('does NOT fire in the sanctioned E2E production build (E2E_BUILD=1)', () => {
    process.env.E2E_BUILD = '1'
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

describe('mock-var list parity', () => {
  it("next.config.js build guard lists EXACTLY mock/env.ts's MOCK_ONLY_ENV_VARS", () => {
    // The build-time guard in next.config.js (CommonJS, cannot import the TS module)
    // hand-copies this list. Bind the two so a var added in one but not the other fails
    // CI instead of silently un-guarding a mock var in the build or at boot.
    const config = readFileSync('next.config.js', 'utf8')
    const listMatch = config.match(/\[\s*('MOCK_MODE'[\s\S]*?)\]/)
    expect(listMatch, "next.config.js mock-var array (starting 'MOCK_MODE') not found").toBeTruthy()
    const inConfig = [...listMatch![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
    expect(new Set(inConfig)).toEqual(new Set(MOCK_ONLY_ENV_VARS))
  })
})
