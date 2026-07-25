import type { Metadata } from 'next'
import SectionWrapper from '@/app/components/SectionWrapper'
import { MARKETING_ABOUT_ICONS, MARKETING_VALUES } from '@/lib/content/marketing'

export const metadata: Metadata = {
  title: 'About Us | Cert-Ed Academia',
  description:
    "Learn about Cert-Ed Academia's mission to provide personalised one-to-one online learning for students across India and GCC.",
}

export default function About() {
  return (
    <div className="flex min-h-screen flex-col">
      <section className="bg-gray-50 px-4 py-10 text-center text-slate-900">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
            About Cert-Ed Academia
          </h1>
          <p className="text-xl font-medium leading-relaxed text-gray-600">
            We provide personalised one-to-one online tuition for students across <strong>India and the GCC</strong>,
            helping each child reach their academic potential.
          </p>
        </div>
      </section>

      <SectionWrapper id="mission" className="bg-white">
        <div className="flex flex-col items-center gap-6 md:flex-row">
          <div className="flex-1 space-y-6">
            <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-primary/10 p-3">
              <MARKETING_ABOUT_ICONS.mission className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Our Mission</h2>
            <div className="space-y-4">
              <p className="text-lg leading-relaxed text-gray-700">
                Build a collaborative learning space where students, tutors, and mentors grow by sharing knowledge with
                each other.
              </p>
              <p className="text-lg leading-relaxed text-gray-700">
                Encourage curiosity-driven learning instead of one-way teaching.
              </p>
              <p className="text-lg leading-relaxed text-gray-700">
                Create fun, friendly, and engaging classes where tutors guide students like supportive friends.
              </p>
              <p className="text-lg leading-relaxed text-gray-700">
                Help students develop confidence, understanding, and a genuine love for learning.
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-gray-100 bg-gradient-to-br from-primary/5 to-secondary/10 p-8 shadow-sm md:p-12">
            <div className="text-center">
              <MARKETING_ABOUT_ICONS.team className="mx-auto mb-4 h-16 w-16 text-secondary" />
              <p className="text-2xl font-bold text-gray-800">Transforming Lives Through Education</p>
            </div>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper id="vision" className="bg-gray-50">
        <div className="flex flex-col items-center gap-6 md:flex-row-reverse">
          <div className="flex-1 space-y-6">
            <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-secondary/10 p-3">
              <MARKETING_ABOUT_ICONS.vision className="h-8 w-8 text-secondary" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Our Vision</h2>
            <p className="text-lg leading-relaxed text-gray-700">
              To create a learning journey where curiosity leads the way, empowering students to explore, question, and
              understand beyond exams.
            </p>
          </div>
          <div className="flex h-64 flex-1 items-center justify-center rounded-3xl bg-gradient-to-br from-secondary to-primary shadow-lg transition-transform duration-500 hover:scale-105 md:h-80">
            <p className="max-w-lg px-8 text-center text-2xl font-bold text-white opacity-90">
              &quot;Building confidence and long-term academic success.&quot;
            </p>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper id="values" className="bg-white">
        <div className="mb-8 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900">Our Core Values</h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            The principles that guide our every interaction with students and parents.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {MARKETING_VALUES.map((value) => (
            <div
              key={value.title}
              className="rounded-xl border border-gray-100 bg-gray-50 p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                <value.icon size={24} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">{value.title}</h3>
              <p className="font-medium text-gray-600">{value.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper id="team" className="bg-gray-50">
        <div className="flex flex-col items-center gap-6 md:flex-row">
          <div className="flex-1">
            <h2 className="mb-6 text-3xl font-bold text-gray-900">Our Team</h2>
            <p className="mb-6 text-lg leading-relaxed text-gray-700">
              Our tutors are trained in CBSE & ICSE curricula and selected for teaching clarity, empathy, and the
              ability to personalise lessons.
            </p>
            <p className="text-lg leading-relaxed text-gray-700">
              Mentors coordinate learning plans and parent communication, ensuring a seamless and supported educational
              journey for every family.
            </p>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-b-[6px] border-r-[6px] border-gray-200 bg-white p-6 text-center shadow-xl">
                <div className="mx-auto mb-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <MARKETING_ABOUT_ICONS.tutor className="h-8 w-8 text-primary" />
                </div>
                <p className="font-bold text-gray-900">Friendly Tutors</p>
              </div>
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-b-[6px] border-r-[6px] border-gray-200 bg-white p-6 text-center shadow-xl">
                <div className="mx-auto mb-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <MARKETING_ABOUT_ICONS.team className="h-8 w-8 text-primary" />
                </div>
                <p className="font-bold text-gray-900">Dedicated Mentors</p>
              </div>
            </div>
          </div>
        </div>
      </SectionWrapper>
    </div>
  )
}
