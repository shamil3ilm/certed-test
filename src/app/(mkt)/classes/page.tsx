import SectionWrapper from '@/app/components/SectionWrapper'

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Classes & Curriculum | CBSE & ICSE Online Tuition',
  description:
    'Explore personalised one-to-one classes, flexible timings, and curriculum designed for CBSE and ICSE students.',
}

export default function Classes() {
  const steps = [
    {
      title: 'Step 1 — Book a Demo Session',
      description: 'Parents request a demo class to experience teaching style and check the tutor match.',
    },
    {
      title: 'Step 2 — Tutor Assignment',
      description:
        'We assign an experienced CBSE/ICSE tutor and a mentor who oversees progress and communicates with parents.',
    },
    {
      title: 'Step 3 — Live One-to-One Classes',
      description: 'Interactive live sessions with concept clarity, examples, and regular practice.',
    },
    {
      title: 'Step 4 — Assessment',
      description: 'A short assessment helps identify learning gaps and prepares a personalised plan.',
    },
    {
      title: 'Step 5 — Review & Improve',
      description:
        'Monthly reports, tests, and parent feedback calls ensure measurable improvement and plan adjustments.',
    },
  ]

  const classLevels = [
    {
      title: 'Classes KG–5 (Primary)',
      description:
        'Focus on reading, writing, arithmetic, and basic concepts through activity-based learning and frequent feedback.',
    },
    {
      title: 'Classes 6–8 (Middle School)',
      description: 'Concept clarity, problem-solving, and homework support across Maths, Science, and Languages.',
    },
    {
      title: 'Classes 9–10 (High School)',
      description:
        'Exam-focused teaching, sample paper practice, doubt clearing and chapter-wise assessments for CBSE & ICSE boards.',
    },
    {
      title: 'Classes 11–12 (Senior Secondary)',
      description:
        'Advanced subject tuition, stream-specific coaching (Science, Commerce, Humanities), and college-prep support if required.',
    },
  ]

  const subjects = [
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Social Science',
    'Computer Science',
    'Arabic',
    'Islamic Studies',
    'Hindi',
    'English',
    'Malayalam',
    'Moral Studies',
  ]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <section className="bg-white text-slate-900 py-10 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">Online Classes & Curriculum</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          CBSE & ICSE (Classes KG - 12) — We offer structured, syllabus-aligned one-to-one classes that build strong
          fundamentals and exam readiness.
        </p>
      </section>

      {/* Class-wise Overview */}
      <SectionWrapper id="class-overview" className="bg-gray-50">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Class-wise Overview</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {classLevels.map((level, index) => (
            <div
              key={index}
              className="p-8 border border-gray-100 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group"
            >
              <h3 className="text-2xl font-bold text-primary mb-3">{level.title}</h3>
              <p className="text-gray-700 leading-relaxed text-lg">{level.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* Subjects We Teach */}
      <SectionWrapper id="subjects" className="bg-primary rounded-b-[4rem] !py-12">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-4">Subjects We Teach</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {subjects.map((subject, index) => (
            <div
              key={index}
              className="bg-white px-6 py-6 rounded-lg shadow-md text-primary font-medium text-lg hover:shadow-xl hover:-translate-y-1 hover:scale-105 transition-all duration-300 cursor-pointer text-center flex items-center justify-center w-full h-full"
            >
              {subject}
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* How it Works */}
      <SectionWrapper id="how-it-works" className="bg-white">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">How It Works — Our Process</h2>
          <p className="text-lg text-gray-600 mt-2">Simple, Effective, and Result-Oriented</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative p-6 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group"
            >
              <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md mb-4 shrink-0">
                {index + 1}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title.split('—')[1] || step.title}</h3>
              <p className="text-gray-600 leading-relaxed text-sm flex-grow">{step.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>
    </div>
  )
}
