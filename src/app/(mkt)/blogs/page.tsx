import type { Metadata } from 'next'
import BlogCard from '@/app/components/BlogCard'
import SectionWrapper from '@/app/components/SectionWrapper'
import { MARKETING_BLOGS } from '@/lib/content/marketing'

export const metadata: Metadata = {
  title: 'Education Blogs | CBSE & ICSE Study Tips',
  description: 'Read blogs on CBSE and ICSE preparation, study techniques, exam strategies, and learning tips.',
}

export default function Blogs() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SectionWrapper>
        <div className="mb-16 text-center">
          <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">Our Latest Insights</h1>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            Stay updated with the latest trends in education, study tips, and success stories.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {MARKETING_BLOGS.map((blog) => (
            <BlogCard key={blog.slug} {...blog} />
          ))}
        </div>
      </SectionWrapper>
    </div>
  )
}
