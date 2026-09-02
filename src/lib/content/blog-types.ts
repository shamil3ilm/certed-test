import { z } from 'zod'

/**
 * The typed frontmatter every blog post `.mdx` file exports as `export const meta`.
 * `@next/mdx` has no native YAML frontmatter, so metadata travels as a normal module
 * export - and this schema is what turns that untyped export into a trusted value:
 * the registry parses each imported `meta` through it, so a malformed or half-written
 * post fails the build loudly instead of rendering a blank card. The `slug` is NOT
 * part of the file's own metadata - it is the filename, attached by the registry - so
 * it can never disagree with the route that serves the post.
 */
export const blogMetaSchema = z.object({
  /** Card + SEO title (the short form shown on the listing). */
  title: z.string().min(1),
  /** On-page H1 (usually a longer form than the card title). */
  heading: z.string().min(1),
  /** One-line summary for the listing card and social preview. */
  excerpt: z.string().min(1),
  /** Cover image path under /public. */
  image: z.string().min(1),
  /** Human-readable publish date, e.g. "March 15, 2026". Replaces the old
   *  hard-coded "Current Date" placeholder that every post rendered verbatim. */
  date: z.string().min(1),
  /** Section label shown as the eyebrow, e.g. "Exam Prep". */
  category: z.string().min(1),
  /** <title> for the post route. */
  seoTitle: z.string().min(1),
  /** <meta name="description"> for the post route. */
  seoDescription: z.string().min(1),
  /** The trailing call-to-action panel, which differs per post. */
  cta: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    label: z.string().min(1),
  }),
})

export type BlogMeta = z.infer<typeof blogMetaSchema>

/** A post as consumed by the app: its validated metadata plus the filename slug. */
export type BlogPost = BlogMeta & { slug: string }
