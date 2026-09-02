import { blogMetaSchema, type BlogPost } from './blog-types'
import { meta as examPrepMeta } from '@/content/blog/cbse-board-exam-preparation-tips.mdx'
import { meta as studyLeaveMeta } from '@/content/blog/how-to-utilise-study-leave-during-exams.mdx'
import { meta as answerWritingMeta } from '@/content/blog/cbse-icse-answer-writing-tips.mdx'

/**
 * The blog post registry - the ONE place that knows which posts exist and in what
 * order. Each post's metadata is imported from its `.mdx` file and validated here, so
 * the listing cards, the sitemap, and the [slug] route all read the same source and
 * cannot drift (the bug this replaces: post files, a separate MARKETING_BLOGS array,
 * and a hard-coded sitemap list each maintained the post set independently).
 *
 * The slug is the filename, supplied here rather than stored in the file, so a post's
 * URL can never disagree with the metadata that describes it. Adding a post = add its
 * `.mdx` file and one row below.
 */
const RAW_POSTS: ReadonlyArray<{ slug: string; meta: unknown }> = [
  { slug: 'cbse-board-exam-preparation-tips', meta: examPrepMeta },
  { slug: 'how-to-utilise-study-leave-during-exams', meta: studyLeaveMeta },
  { slug: 'cbse-icse-answer-writing-tips', meta: answerWritingMeta },
]

export const BLOG_POSTS: readonly BlogPost[] = RAW_POSTS.map(({ slug, meta }) => ({
  slug,
  ...blogMetaSchema.parse(meta),
}))

export const BLOG_POST_SLUGS: readonly string[] = BLOG_POSTS.map((post) => post.slug)

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug)
}
