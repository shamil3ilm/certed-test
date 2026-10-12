import type { MetadataRoute } from 'next'
import { isIndexableHost } from '@/lib/routing/public-host'

const SITE = 'https://www.certedacademia.com'

// Decided at REQUEST time, not baked at build, because the answer depends on the host the
// request arrived on. The output is tiny, so per-request generation is free.
export const dynamic = 'force-dynamic'

/**
 * Crawl rules. The public marketing pages are open; the authenticated portal
 * (its own subdomain) and the API are disallowed so they never surface in search
 * results even if a link leaks.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Anything that is not the canonical public host - the portal subdomain, staging, a preview
  // deploy - is kept out of search entirely rather than trusted to disallow the right paths.
  if (!(await isIndexableHost())) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/admin', '/classroom', '/messages', '/settings', '/students', '/grading'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}
