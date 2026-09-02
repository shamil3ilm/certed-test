import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { blogMetaSchema } from '@/lib/content/blog-types'
import { BLOG_POSTS, BLOG_POST_SLUGS, getBlogPost } from '@/lib/content/blog-posts'
import { MARKETING_BLOGS } from '@/lib/content/marketing-blogs'

const ROOT = process.cwd()
const CONTENT_DIR = path.join(ROOT, 'src/content/blog')

const validMeta = {
  title: 'A title',
  heading: 'A heading',
  excerpt: 'An excerpt',
  image: '/blogs/x.svg',
  date: 'March 1, 2026',
  category: 'Exam Prep',
  seoTitle: 'SEO title',
  seoDescription: 'SEO description',
  cta: { heading: 'CTA heading', body: 'CTA body', label: 'Go' },
}

describe('blogMetaSchema', () => {
  it('accepts a fully-formed meta object', () => {
    expect(() => blogMetaSchema.parse(validMeta)).not.toThrow()
  })

  it('rejects meta missing a required field', () => {
    const { heading: _omit, ...withoutHeading } = validMeta
    expect(() => blogMetaSchema.parse(withoutHeading)).toThrow()
  })

  it('rejects an empty string field', () => {
    expect(() => blogMetaSchema.parse({ ...validMeta, title: '' })).toThrow()
  })

  it('rejects a partial cta', () => {
    expect(() => blogMetaSchema.parse({ ...validMeta, cta: { heading: 'h', body: 'b' } })).toThrow()
  })
})

describe('BLOG_POSTS registry', () => {
  it('has every post pass the schema with a slug attached', () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0)
    for (const post of BLOG_POSTS) {
      expect(post.slug).toBeTruthy()
      // The stored posts are the schema shape plus slug; re-validate the metadata.
      const { slug: _slug, ...meta } = post
      expect(() => blogMetaSchema.parse(meta)).not.toThrow()
    }
  })

  it('has unique slugs', () => {
    expect(new Set(BLOG_POST_SLUGS).size).toBe(BLOG_POST_SLUGS.length)
  })

  it('does not render the old "Current Date" placeholder as a post date', () => {
    for (const post of BLOG_POSTS) {
      expect(post.date).not.toMatch(/current date/i)
    }
  })

  it('getBlogPost resolves a known slug and returns undefined otherwise', () => {
    expect(getBlogPost(BLOG_POST_SLUGS[0])?.slug).toBe(BLOG_POST_SLUGS[0])
    expect(getBlogPost('no-such-post')).toBeUndefined()
  })
})

describe('registry <-> filesystem parity', () => {
  it('registers exactly the .mdx files present in src/content/blog', () => {
    const fileSlugs = readdirSync(CONTENT_DIR)
      .filter((name) => name.endsWith('.mdx'))
      .map((name) => name.replace(/\.mdx$/, ''))
    expect(new Set(BLOG_POST_SLUGS)).toEqual(new Set(fileSlugs))
  })

  it('leaves no legacy per-post page directory behind (all posts served by [slug])', () => {
    for (const slug of BLOG_POST_SLUGS) {
      expect(existsSync(path.join(ROOT, 'src/app/(mkt)/blogs', slug))).toBe(false)
    }
  })
})

describe('MARKETING_BLOGS is derived from the registry', () => {
  it('mirrors the registry slugs and titles in order', () => {
    expect(MARKETING_BLOGS.map((b) => b.slug)).toEqual([...BLOG_POST_SLUGS])
    for (const card of MARKETING_BLOGS) {
      const post = getBlogPost(card.slug)
      expect(post).toBeDefined()
      expect(card.title).toBe(post?.title)
      expect(card.excerpt).toBe(post?.excerpt)
      expect(card.image).toBe(post?.image)
    }
  })
})
