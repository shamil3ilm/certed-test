import SectionWrapper from '@/app/components/SectionWrapper'
import BlogCard from '@/app/components/BlogCard'

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Education Blogs | CBSE & ICSE Study Tips',
  description: 'Read blogs on CBSE and ICSE preparation, study techniques, exam strategies, and learning tips.',
}

export default function Blogs() {
  const blogs = [
    {
      title: 'CBSE Board Exam Preparation Tips: A Smart Study Plan',
      excerpt:
        'Learn the best CBSE board exam preparation tips using a 4-phase study strategy covering learning, practice, revision, and mock tests.',
      image: '/blogs/cbse-board-exam-prep-cover.svg',
      date: 'March 15, 2026',
      category: 'Exam Prep',
      slug: 'cbse-board-exam-preparation-tips',
    },
    {
      title: 'How to Use Study Leave Effectively: Exam Gap Study Plan',
      excerpt:
        'Learn how to utilise study leave during board exams with a smart exam gap study plan including revision strategies, stress management, and health tips.',
      image: '/blogs/study-leave-plan-cover.svg',
      date: 'February 28, 2026',
      category: 'Study Tips',
      slug: 'how-to-utilise-study-leave-during-exams',
    },
    {
      title: 'CBSE & ICSE Answer Writing Tips: Write Smart and Score More',
      excerpt:
        'Learn effective CBSE & ICSE answer writing tips to improve presentation, highlight keywords, structure answers clearly, and score higher.',
      image: '/blogs/answer-writing-tips-cover.svg',
      date: 'January 12, 2026',
      category: 'Exam Tricks',
      slug: 'cbse-icse-answer-writing-tips',
    },
  ]

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <SectionWrapper>
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Our Latest Insights</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Stay updated with the latest trends in education, study tips, and success stories.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogs.map((blog, index) => (
            <BlogCard key={index} {...blog} />
          ))}
        </div>
      </SectionWrapper>
    </div>
  )
}
