import type { MetadataRoute } from 'next'

const SITE = 'https://certedacademia.com'

// Read PORTAL_ONLY at REQUEST time (matching the middleware + robots.ts), so a
// private preview host serves an empty sitemap regardless of build-time env.
export const dynamic = 'force-dynamic'

/** The publicly indexable marketing pages. Portal routes are private and are
 *  excluded here and disallowed in robots.ts. */
const PUBLIC_PATHS = [
  '',
  '/about',
  '/contact',
  '/blogs',
  '/blogs/cbse-board-exam-preparation-tips',
  '/blogs/cbse-icse-answer-writing-tips',
  '/blogs/how-to-utilise-study-leave-during-exams',
]

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
