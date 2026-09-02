import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { MARKETING_BLOGS } from '@/lib/content/marketing'
import { getBlogPost } from '@/lib/content/blog-posts'

const MARKETING_NAV_HREFS = ['/', '/about', '/classes', '/blogs', '/contact'] as const
// Footer-only legal pages (not in the nav). They must also be in proxy MARKETING_PATHS
// to route correctly on the marketing host - this guards the page files exist.
const FOOTER_LEGAL_HREFS = ['/privacy', '/terms'] as const

function marketingPagePath(href: string) {
  if (href === '/') {
    return path.join(process.cwd(), 'src', 'app', '(mkt)', 'page.tsx')
  }

  return path.join(process.cwd(), 'src', 'app', '(mkt)', href.slice(1), 'page.tsx')
}

describe('marketing route guardrails', () => {
  it.each(MARKETING_NAV_HREFS)('marketing route "%s" maps to a real page.tsx', (href) => {
    const pagePath = marketingPagePath(href)
    expect(existsSync(pagePath), `${href} -> ${pagePath} does not exist`).toBe(true)
  })

  it.each(FOOTER_LEGAL_HREFS)('footer legal route "%s" maps to a real page.tsx', (href) => {
    const pagePath = marketingPagePath(href)
    expect(existsSync(pagePath), `${href} -> ${pagePath} does not exist`).toBe(true)
  })

  it('serves every blog post through the shared [slug] route', () => {
    // Posts are no longer one page.tsx each - the dynamic (mkt)/blogs/[slug] route
    // renders them all from src/content/blog/*.mdx via the registry.
    const routePath = path.join(process.cwd(), 'src', 'app', '(mkt)', 'blogs', '[slug]', 'page.tsx')
    expect(existsSync(routePath), `${routePath} does not exist`).toBe(true)
  })

  it.each(MARKETING_BLOGS)('blog card "$title" resolves to a registered post', ({ slug }) => {
    expect(getBlogPost(slug), `/blogs/${slug} is not a registered post`).toBeDefined()
  })
})
