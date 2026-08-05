import type { MetadataRoute } from 'next'

const SITE = 'https://certedacademia.com'

// Read PORTAL_ONLY at REQUEST time (matching the middleware), not baked at build,
// so a private preview host is correctly de-indexed regardless of when the flag
// is set. The output is tiny, so per-request generation is free.
export const dynamic = 'force-dynamic'

/**
 * Crawl rules. The public marketing pages are open; the authenticated portal
 * (its own subdomain) and the API are disallowed so they never surface in search
 * results even if a link leaks.
 */
export default function robots(): MetadataRoute.Robots {
  // A PORTAL_ONLY deploy is a private preview/test host (no marketing site) - keep
  // it out of search entirely. The real marketing host runs without the flag and
  // serves the crawl rules below.
  if (process.env.PORTAL_ONLY === '1') {
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
