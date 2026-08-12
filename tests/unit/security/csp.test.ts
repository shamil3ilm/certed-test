import { describe, it, expect } from 'vitest'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'

function directive(csp: string, name: string): string {
  return csp.split('; ').find((d) => d.startsWith(name)) ?? ''
}

describe('buildContentSecurityPolicy', () => {
  it('portal policy (with nonce): nonce + strict-dynamic, no unsafe-* in script-src', () => {
    const scriptSrc = directive(buildContentSecurityPolicy('abc123'), 'script-src')
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'") // NODE_ENV=test → no unsafe-eval
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it('marketing policy (no nonce): keeps unsafe-inline for statically-rendered inline scripts', () => {
    const scriptSrc = directive(buildContentSecurityPolicy(null), 'script-src')
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'")
  })

  it('preserves the shared directives on both surfaces', () => {
    for (const csp of [buildContentSecurityPolicy('n'), buildContentSecurityPolicy(null)]) {
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("connect-src 'self' https://*.supabase.co")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toContain('form-action') // deliberately omitted
    }
  })

  it('generateNonce returns a fresh base64 token each call', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(a.length).toBeGreaterThanOrEqual(20)
  })
})
