import type { MarketingBlogSummary } from './marketing-shared'
import { BLOG_POSTS } from './blog-posts'

/**
 * Listing-card summaries for /blogs, projected from the blog registry so the cards and
 * the posts they link to always describe the same set. Was a hand-maintained array
 * that could fall out of step with the actual post files; now it is derived.
 */
export const MARKETING_BLOGS: MarketingBlogSummary[] = BLOG_POSTS.map((post) => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  image: post.image,
  date: post.date,
  category: post.category,
}))
