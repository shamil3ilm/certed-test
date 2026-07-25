import type { MetadataRoute } from 'next'

const SITE = 'https://certedacademia.com'

/**
 * Crawl rules. The public marketing pages are open; the authenticated portal
 * (its own subdomain) and the API are disallowed so they never surface in search
 * results even if a link leaks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/admin', '/classroom', '/messages', '/settings', '/students', '/grading'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}
