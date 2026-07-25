import type { MetadataRoute } from 'next'

const SITE = 'https://certedacademia.com'

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
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path.startsWith('/blogs') ? 'monthly' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))
}
