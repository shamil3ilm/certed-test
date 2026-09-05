import type { Metadata } from 'next'
import SectionWrapper from '@/app/components/SectionWrapper'
import { MARKETING_CLASS_LEVELS, MARKETING_CLASS_STEPS, MARKETING_SUBJECTS } from '@/lib/content/marketing'

export const metadata: Metadata = {
  title: 'Classes & Curriculum | CBSE & ICSE Online Tuition',
  description:
    'Explore personalised one-to-one classes, flexible timings, and curriculum designed for CBSE and ICSE students.',
}

export default function Classes() {
  return (
    <div className="flex min-h-screen flex-col">
      <section className="bg-white px-4 py-10 text-center text-slate-900">
        <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">Online Classes & Curriculum</h1>
        <p className="mx-auto max-w-2xl text-xl text-gray-600">
          CBSE & ICSE (Classes KG - 12) - We offer structured, syllabus-aligned one-to-one classes that build strong
          fundamentals and exam readiness.
        </p>
      </section>

      <SectionWrapper id="class-overview" className="bg-gray-50">
        <div className="mb-8 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900">Class-wise Overview</h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {MARKETING_CLASS_LEVELS.map((level) => (
            <div
              key={level.title}
              className="group rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <h3 className="mb-3 text-2xl font-bold text-primary">{level.title}</h3>
              <p className="text-lg leading-relaxed text-gray-700">{level.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper id="subjects" className="rounded-b-[4rem] bg-primary !py-12">
        <div className="mb-6 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">Subjects We Teach</h2>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {MARKETING_SUBJECTS.map((subject) => (
            <div
              key={subject}
              className="flex h-full w-full items-center justify-center rounded-lg bg-white px-6 py-6 text-center text-lg font-medium text-primary shadow-md transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-xl"
            >
              {subject}
            </div>
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper id="how-it-works" className="bg-white">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">How It Works - Our Process</h2>
          <p className="mt-2 text-lg text-gray-600">Simple, Effective, and Result-Oriented</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {MARKETING_CLASS_STEPS.map((step, index) => (
            <div
              key={step.title}
              className="group relative flex h-full flex-col rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-ink text-xl font-bold text-white shadow-md">
                {index + 1}
              </div>
              <h3 className="mb-3 text-lg font-bold text-gray-900">{step.title.replace(/^Step \d+ - /, '')}</h3>
              <p className="flex-grow text-sm leading-relaxed text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>
    </div>
  )
}
