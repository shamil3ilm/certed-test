import type { MetadataRoute } from 'next'
import { BLOG_POST_SLUGS } from '@/lib/content/blog-posts'

const SITE = 'https://certedacademia.com'

// Read PORTAL_ONLY at REQUEST time (matching the middleware + robots.ts), so a
// private preview host serves an empty sitemap regardless of build-time env.
export const dynamic = 'force-dynamic'

/** The publicly indexable marketing pages. Portal routes are private and are
 *  excluded here and disallowed in robots.ts. Per-post URLs come from the blog
 *  registry so a new post is indexed automatically, with no list to update here. */
const PUBLIC_PATHS = ['', '/about', '/contact', '/blogs', ...BLOG_POST_SLUGS.map((slug) => `/blogs/${slug}`)]

export default function sitemap(): MetadataRoute.Sitemap {
  // A PORTAL_ONLY deploy is a private preview/test host with no public marketing
  // pages to index (robots also disallows all there).
  if (process.env.PORTAL_ONLY === '1') return []
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path.startsWith('/blogs') ? 'monthly' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))
}
