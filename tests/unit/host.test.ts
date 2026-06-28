import { describe, it, expect } from 'vitest'
import { resolveHost } from '@/lib/routing/host'

describe('resolveHost', () => {
  it('maps the app subdomain', () => {
    expect(resolveHost('app.certedacademia.com')).toBe('app')
    expect(resolveHost('app.localhost:3000')).toBe('app')
  })
  it('maps the marketing apex/www', () => {
    expect(resolveHost('certedacademia.com')).toBe('marketing')
    expect(resolveHost('www.certedacademia.com')).toBe('marketing')
  })
  it('treats bare localhost as marketing in dev', () => {
    expect(resolveHost('localhost:3000')).toBe('marketing')
  })
})
