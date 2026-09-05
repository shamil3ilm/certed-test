import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import SectionWrapper from '@/app/components/SectionWrapper'
import PostCta from '@/app/components/blog/PostCta'
import { BLOG_POST_SLUGS, getBlogPost } from '@/lib/content/blog-posts'

/**
 * One route renders every blog post: it looks the post's metadata up in the registry,
 * dynamically imports the matching `.mdx` body, and wraps it in the shared chrome
 * (back link, header, trailing CTA). Replaces three near-identical hand-written post
 * page.tsx files. `dynamicParams = false` + generateStaticParams means an unknown slug
 * 404s and the known posts are statically prerendered.
 */

export const dynamicParams = false

export function generateStaticParams(): { slug: string }[] {
  return BLOG_POST_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}
  return { title: post.seoTitle, description: post.seoDescription }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  const { default: Post } = await import(`@/content/blog/${slug}.mdx`)

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <SectionWrapper>
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/blogs" className="inline-flex min-h-10 items-center text-primary hover:underline font-medium">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blogs
            </Link>
          </div>

          <header className="mb-12 border-b border-gray-100 pb-8">
            <div className="flex items-center text-sm text-secondary-ink font-semibold uppercase tracking-wide mb-4">
              <span>{post.category}</span>
              <span className="mx-2 text-gray-300">•</span>
              <span className="text-gray-600">{post.date}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">{post.heading}</h1>
          </header>

          <article className="max-w-none">
            <Post />
          </article>

          <PostCta cta={post.cta} />
        </div>
      </SectionWrapper>
    </div>
  )
}
