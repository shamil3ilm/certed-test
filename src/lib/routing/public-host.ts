import 'server-only'
import { headers } from 'next/headers'

/**
 * The only hosts whose pages belong in a search index.
 *
 * `robots.ts` and `sitemap.ts` used to key their crawl rules on PORTAL_ONLY, which worked only
 * while someone remembered to set it: with the flag absent, a staging host served `Allow: /`
 * and the full marketing site, so a copy of the public pages was crawlable on a second hostname
 * (found live on app.staging.certedacademia.com). The portal host had the same problem - it
 * invited crawling of `/` and relied on per-path Disallow lines to keep the app out.
 *
 * Keying on the HOST instead inverts the default: a host has to be named here to be indexable,
 * so every preview, staging and portal host is excluded by being unmentioned rather than by
 * being configured. The apex is included because it serves the same pages before redirecting.
 *
 * The failure mode worth knowing: if production ever answers on a host NOT in this list, it
 * de-indexes itself. That is why both the www and apex forms are here, and why
 * tests/unit/indexable-host.test.ts pins the behaviour. It is the same canonical host the
 * sitemap, robots and metadataBase already hardcode.
 */
const INDEXABLE_HOSTS: ReadonlySet<string> = new Set(['www.certedacademia.com', 'certedacademia.com'])

/** True when the request arrived on a host whose pages may be crawled and indexed. */
export async function isIndexableHost(): Promise<boolean> {
  // A PORTAL_ONLY deploy is a private preview with no public pages at all; keep honouring it
  // so a host that is somehow named below is still excluded when the flag says it is private.
  if (process.env.PORTAL_ONLY === '1') return false
  const host = (await headers()).get('host')
  if (!host) return false
  return INDEXABLE_HOSTS.has(host.split(':')[0].toLowerCase())
}
