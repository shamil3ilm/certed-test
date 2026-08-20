import { describe, it, expect, afterEach, vi } from 'vitest'
import { isMock } from '@/lib/mock/env'

/**
 * isMock() gates an UNSIGNED-cookie auth bypass, so its fail-closed behaviour on
 * deployed/production runtimes is security-critical - these lock it in.
 */

const KEYS = ['VERCEL', 'NODE_ENV', 'ALLOW_MOCK_AUTH', 'MOCK_MODE', 'NEXT_PUBLIC_MOCK_MODE'] as const

// vi.stubEnv handles NODE_ENV (a read-only typed property) and auto-restores; an
// undefined value unsets the var, so each case starts from a clean slate.
function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) vi.stubEnv(k, env[k])
}

afterEach(() => vi.unstubAllEnvs())

describe('isMock', () => {
  it('activates locally when MOCK_MODE=1 outside a production runtime', () => {
    setEnv({ MOCK_MODE: '1', NODE_ENV: 'development' })
    expect(isMock()).toBe(true)
  })

  it('never activates on Vercel, even with MOCK_MODE and the opt-in set', () => {
    setEnv({ VERCEL: '1', MOCK_MODE: '1', ALLOW_MOCK_AUTH: '1', NODE_ENV: 'production' })
    expect(isMock()).toBe(false)
  })

  it('fails closed on a non-Vercel production runtime without the explicit opt-in', () => {
    // The reported hole: any host where VERCEL!=1 but NODE_ENV=production.
    setEnv({ MOCK_MODE: '1', NODE_ENV: 'production' })
    expect(isMock()).toBe(false)
    // The client-inlined flag must not re-open it either.
    setEnv({ NEXT_PUBLIC_MOCK_MODE: '1', NODE_ENV: 'production' })
    expect(isMock()).toBe(false)
  })

  it('activates on a production build ONLY with the dev-only opt-in (the E2E case)', () => {
    setEnv({ MOCK_MODE: '1', NODE_ENV: 'production', ALLOW_MOCK_AUTH: '1', VERCEL: '0' })
    expect(isMock()).toBe(true)
  })

  it('is off when no mock flag is set', () => {
    setEnv({ NODE_ENV: 'development' })
    expect(isMock()).toBe(false)
  })
})
