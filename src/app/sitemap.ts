import type { MetadataRoute } from 'next'
import { BLOG_POST_SLUGS } from '@/lib/content/blog-posts'
import { isIndexableHost } from '@/lib/routing/public-host'

const SITE = 'https://www.certedacademia.com'

// Decided at REQUEST time (matching robots.ts), because the answer depends on the host the
// request arrived on rather than on anything known at build.
export const dynamic = 'force-dynamic'

/** The publicly indexable marketing pages. Portal routes are private and are
 *  excluded here and disallowed in robots.ts. Per-post URLs come from the blog
 *  registry so a new post is indexed automatically, with no list to update here. */
const PUBLIC_PATHS = ['', '/about', '/contact', '/blogs', ...BLOG_POST_SLUGS.map((slug) => `/blogs/${slug}`)]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A host that is not the canonical public one has no public pages to offer a crawler, and
  // listing production's URLs from a staging host would only invite confusion about which is
  // authoritative. robots.ts disallows everything on those hosts for the same reason.
  if (!(await isIndexableHost())) return []
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path.startsWith('/blogs') ? 'monthly' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))
}
