import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import FAQAccordion from '@/app/components/FAQAccordion'
import FeatureCard from '@/app/components/FeatureCard'
import SectionWrapper from '@/app/components/SectionWrapper'
import TestimonialSlider from '@/app/components/TestimonialSlider'
import { MARKETING_FAQS, MARKETING_FEATURES, MARKETING_TESTIMONIALS } from '@/lib/content/marketing'

export const metadata: Metadata = {
  title: 'Online Tuition for CBSE & ICSE Students | Cert-Ed Academia',
  description:
    'Join personalised one-to-one online classes for CBSE and ICSE students. Flexible schedules, expert tutors, and exam-focused learning.',
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <section className="relative overflow-hidden bg-white px-4 py-8 text-slate-900 md:py-12">
        <div className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-[500px] w-[500px] translate-x-1/3 -translate-y-1/2 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-[500px] w-[500px] -translate-x-1/2 translate-y-1/3 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-blue-100/50 blur-3xl" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-8 md:flex-row md:gap-16">
          <div className="flex-1 text-center md:text-left">
            <h1 className="mb-6 text-3xl font-extrabold leading-tight tracking-tight text-black md:text-5xl">
              Personalised One-to-One Online Tuition <br className="hidden lg:block" /> for CBSE & ICSE Students
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-lg font-medium leading-relaxed text-slate-800 md:mx-0 md:text-xl">
              <strong>Cert-Ed Academia</strong> provides individual attention, dedicated tutors, and flexible online
              classes for students across <strong>India & GCC</strong> (UAE, Saudi Arabia, Qatar, Kuwait, Oman,
              Bahrain).
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row md:justify-start">
              <Link
                href="/contact"
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-bold text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-primary/90 hover:shadow-xl md:text-lg"
              >
                Book a Demo Session <ArrowRight size={20} />
              </Link>
            </div>
          </div>

          <div className="flex w-full flex-1 justify-center md:justify-end">
            <div className="relative aspect-square w-full max-w-[600px] md:aspect-[4/3] lg:aspect-square">
              <Image
                src="/child-online-learning-cbse-icse-student-india-gcc.webp"
                alt="Child attending one-to-one online tuition and writing notes on tablet"
                fill
                className="h-auto w-full object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <SectionWrapper className="bg-white text-center">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold text-gray-900 md:text-4xl">
            Help your child build confidence and scores with one-to-one tuition
          </h2>
          <p className="text-xl leading-relaxed text-gray-600">
            Our personalised classes focus on concept clarity, regular progress tracking, and parent communication.
            Ideal for busy families in India and the Gulf.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/classes"
              className="flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-bold text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-primary/90 hover:shadow-xl md:text-lg"
            >
              Check the classes we offer <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper id="features" className="border-l-8 border-primary bg-gray-50">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Key Features</h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Why thousands of parents trust us with their child&apos;s education.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {MARKETING_FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper className="bg-white">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">What Parents & Students Say</h2>
        </div>

        <TestimonialSlider testimonials={MARKETING_TESTIMONIALS} />
      </SectionWrapper>

      <SectionWrapper className="bg-gray-100">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Frequently Asked Questions</h2>
        </div>

        <div className="mx-auto max-w-3xl">
          <FAQAccordion items={MARKETING_FAQS} />
        </div>
      </SectionWrapper>

      <section className="bg-primary px-4 py-20 text-center text-white">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">Book a Demo Session</h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl opacity-90">
            Experience our teaching style first-hand. A demo helps us understand your child&apos;s needs and match the
            right tutor.
          </p>

          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-white px-12 py-4 text-lg font-bold text-primary shadow-xl transition-all duration-300 hover:scale-105 hover:bg-gray-100 hover:shadow-2xl"
          >
            Book Demo <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  )
}
