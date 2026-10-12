import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

import { headers } from 'next/headers'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

/**
 * Only the canonical public host may be crawled.
 *
 * This replaced a PORTAL_ONLY check that worked only while someone remembered to set the flag:
 * with it absent, app.staging.certedacademia.com served `Allow: /` and the whole marketing
 * site, so a second crawlable copy of the public pages existed on a staging hostname.
 *
 * The important assertion is the DEFAULT: an unrecognised host is excluded. The opposite
 * default is the one that leaks, because it needs configuration to be safe.
 *
 * The matching hazard is this gate de-indexing PRODUCTION if its host were ever missing from
 * the list, so both the www and apex forms are pinned here. If the canonical host changes,
 * these tests fail and must be updated alongside SITE and metadataBase.
 */
const onHost = (host: string | null) =>
  vi.mocked(headers).mockResolvedValue({ get: (k: string) => (k === 'host' ? host : null) } as never)

const originalPortalOnly = process.env.PORTAL_ONLY
beforeEach(() => {
  vi.resetAllMocks()
  delete process.env.PORTAL_ONLY
})
afterEach(() => {
  if (originalPortalOnly === undefined) delete process.env.PORTAL_ONLY
  else process.env.PORTAL_ONLY = originalPortalOnly
})

const disallowsEverything = (r: Awaited<ReturnType<typeof robots>>) => {
  const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules
  return rules?.disallow === '/' && !rules?.allow
}

describe('the canonical public host', () => {
  it.each(['www.certedacademia.com', 'certedacademia.com', 'WWW.CertEdAcademia.com', 'www.certedacademia.com:443'])(
    'is crawlable, and offers a sitemap (%s)',
    async (host) => {
      onHost(host)
      const r = await robots()
      expect(disallowsEverything(r)).toBe(false)
      expect(r.sitemap).toBe('https://www.certedacademia.com/sitemap.xml')
      onHost(host)
      expect((await sitemap()).length).toBeGreaterThan(0)
    },
  )
})

describe('every other host', () => {
  it.each([
    ['the portal subdomain', 'app.certedacademia.com'],
    ['staging', 'app.staging.certedacademia.com'],
    ['a preview deploy', 'wed-cert-git-feature-certedapp.vercel.app'],
    ['a look-alike domain', 'certedacademia.com.evil.test'],
    ['a host that merely contains the name', 'notcertedacademia.com'],
    ['no host header at all', null],
  ])('is kept out of search entirely (%s)', async (_label, host) => {
    onHost(host)
    expect(disallowsEverything(await robots())).toBe(true)
    onHost(host)
    expect(await sitemap()).toEqual([])
  })
})

describe('PORTAL_ONLY', () => {
  it('still excludes a host even when it is the canonical one', async () => {
    // A private preview served on the real domain is still private.
    process.env.PORTAL_ONLY = '1'
    onHost('www.certedacademia.com')
    expect(disallowsEverything(await robots())).toBe(true)
    onHost('www.certedacademia.com')
    expect(await sitemap()).toEqual([])
  })
})
