import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { MARKETING_BLOGS } from '@/lib/content/marketing'

const MARKETING_NAV_HREFS = ['/', '/about', '/classes', '/blogs', '/contact'] as const

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

  it.each(MARKETING_BLOGS)('blog card "$title" maps to a real blog page', ({ slug }) => {
    const pagePath = path.join(process.cwd(), 'src', 'app', '(mkt)', 'blogs', slug, 'page.tsx')
    expect(existsSync(pagePath), `/blogs/${slug} -> ${pagePath} does not exist`).toBe(true)
  })
})
