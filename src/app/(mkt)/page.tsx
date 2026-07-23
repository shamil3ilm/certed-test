import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, UserCheck, Clock, TrendingUp, ShieldCheck, ArrowRight, Award } from 'lucide-react'
import SectionWrapper from '@/app/components/SectionWrapper'
import FeatureCard from '@/app/components/FeatureCard'
import TestimonialSlider from '@/app/components/TestimonialSlider'
import FAQAccordion from '@/app/components/FAQAccordion'

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Online Tuition for CBSE & ICSE Students | Cert-Ed Academia',
  description:
    'Join personalised one-to-one online classes for CBSE and ICSE students. Flexible schedules, expert tutors, and exam-focused learning.',
}

export default function Home() {
  const features = [
    {
      icon: BookOpen,
      title: 'Personalised Classes',
      description:
        'Each student receives a dedicated tutor and a customised lesson plan designed for their learning pace and goals.',
    },
    {
      icon: UserCheck,
      title: 'Individual Mentor',
      description:
        'A mentor monitors progress, assigns practice, and shares regular feedback with parents to ensure steady improvement.',
    },
    {
      icon: Clock,
      title: 'Flexible Timings',
      description:
        'Schedule sessions that suit your timezone. We support timings for India and all major GCC countries.',
    },
    {
      icon: Award,
      title: 'CBSE & ICSE Expertise',
      description:
        'Tutors trained in CBSE and ICSE syllabuses for Classes KG - 12. Exam-oriented and concept-focused teaching.',
    },
    {
      icon: TrendingUp,
      title: 'Regular Progress Reports',
      description:
        'Feedbacks, reports and parent calls help you track improvements and adapt learning plans as needed.',
    },
    {
      icon: ShieldCheck,
      title: 'Safe & Secure Online Learning',
      description:
        'Verified tutors, secure video sessions, and child-friendly material ensure a safe learning environment.',
    },
  ]

  const testimonials = [
    {
      quote:
        "I am very satisfied with the classes provided by Cert-Ed Academia for my children. What I really appreciate is that Cert-Ed provides classes based on my children's requirements and even on demand when they need extra support. The flexible schedules, supportive teachers, and one-to-one mentoring have helped my children develop more interest in their studies. The online classes also make learning very convenient for us.",
      author: 'Fasal Punnassery',
      role: 'Dubai Electricity and Water Authority, Dubai\nParent of Faadi (Class VII to VIII) & Aamil (Class I)\nCBSE | With us since 2024',
    },
    {
      quote:
        'My daughter is attending the online Arabic tuition, and we are very satisfied with the classes. The personal tutor gives good attention, and the personal mentor is very supportive. Takshvi enjoys the sessions and feels comfortable learning. We have seen good improvement in her Arabic marks as well.',
      author: 'Manisha Thoonery',
      role: 'Software Developer, Innovo Group, Dubai\nParent of Takshvi Class I\nCBSE | 2025–2026',
    },
    {
      quote:
        "I am very satisfied with the online tuition classes provided for my daughter at Cert-Ed Academia. The classes were well-organized and the tutors gave individual attention, which really helped her understand the subjects better. The tutors were very patient, supportive, and always willing to clarify doubts, making the learning experience comfortable and encouraging. I have seen a positive improvement in my daughter's confidence and understanding. I would definitely recommend the online tuition classes to other parents looking for quality academic support for their children.",
      author: 'Shabin A Karim',
      role: 'HSE Trainer, Qatar\nParent of Tamanna Class VII to X\nCBSE | With us since 2023',
    },
    {
      quote:
        'Classes were very good and useful for quickly studying the topics given in textbook. Mentors were nice and supported my children though their studies. Teachers were also nice and helped prepare for the examinations.',
      author: 'Melby Mathew',
      role: 'General Manager, MEPFLOW Engineering Equipment Trading LLC, Dubai\nParent of Evan (Class X), Sarah (Class II) & Mathew (Class VI)\nCBSE | 2025–2026',
    },
    {
      quote:
        'I studied Physics and Chemistry with Cert-Ed. The one-on-one sessions helped me ask doubts without hesitation, and explained ideas in simple steps. Weekly practice and clear notes made revision easy, and my scores improved over the year. I have never been able to score this well because Physics has always been one of the toughest subject for me but my teacher helped me really well with the basics and prepared me well for my 10th. My mentor was always patient and kept me on track; she built a bridge between me and my teachers, making expectations clearer and my study plan steadier. Thank you for the focused guidance, it made a real difference.',
      author: 'Diya Lakshmi',
      role: 'Student Class IX\nICSE | 2025–2026',
    },
    {
      quote:
        'My daughter has been taking one-on-one classes at Cert-Ed Academia for the past 3 years. The personalized attention lets lessons move at her pace, clears doubts on the spot, and adapts to her learning style. Her confidence and recent scores have improved noticeably. We get regular feedback, and the flexible timings make it easy to balance school and other activities.',
      author: 'Dhanya Menon',
      role: 'Parent of Diya Salesh Class VII → X\nCBSE | With us since 2023',
    },
    {
      quote:
        'I am very happy with the support my child received from Cert-Ed Academia. The Physics and Chemistry classes were very clear, and my child was able to understand the concepts well. The Mathematics classes were also good and helped build a strong understanding, though my child felt there could have been a few more Previous Year Questions discussed. All the teachers were excellent, supportive, and approachable. Their teaching style made it easier for my child to understand the topics and feel more confident. Overall, we had a very positive experience with Cert-Ed Academia. Thank you!',
      author: 'Mohammed Rafi',
      role: 'Parent of Rizwan Class XII\nCBSE | 2025–2026',
    },
    {
      quote:
        'The classes were good. It really helped him understand the concepts. The teacher took the initiative to ensure he understood everything. Revisions and tests were also properly done to make sure that he was able to recollect the concepts.',
      author: 'Parent of Achind Class XII',
      role: 'CBSE | 2024–2025',
    },
    {
      quote:
        "I am truly grateful for the wonderful learning experience my daughters had at Cert-Ed Academia. The teachers are very supportive and dedicated, and the personalized guidance they provide really helped her improve academically. Their genuine commitment to students' progress makes them stand out. I would definitely recommend Cert-Ed to any student looking for quality learning and guidance.",
      author: 'Shahim Abdul Rahman',
      role: 'Kuwait Oil Company, Kuwait\nParent of Ahsana & Alhana Class XII\nCBSE | 2022',
    },
    {
      quote:
        "I'm very happy with the learning support my daughter received from Cert-Ed Academia. The teacher made her feel comfortable asking questions and clearing her doubts, and the mentor support was also very helpful. This guidance really helped her improve her understanding of the subject, and I noticed a significant improvement in her Mathematics marks. I would definitely recommend Cert-Ed Academia to students who want to achieve better results in their studies.",
      author: 'Sunish Kumar',
      role: 'Punjab National Bank\nParent of Vyga Sunish Class IX\nCBSE | 2021–2022',
    },
    {
      quote:
        "As a parent, I had struggled to find a platform that truly understood my child's individual needs. Discovering Cert-Ed Academia was honestly a relief for me. The personal mentoring they provide has been a big positive, especially as a concerned parent. The mentors made sure to keep me regularly updated about my child's progress, which really showed their genuine care and commitment towards the students.",
      author: 'Nasitha Abdul Salam',
      role: 'Parent of Aysha Shana Class VIII to XII\nCBSE | 2020-2025',
    },
    {
      quote:
        'Since enrolling my daughter at Cert-Ed Academia, we have seen remarkable progress in her Arabic skills. Her confidence and ability in both reading and writing have improved significantly. The quality of tuition is exceptional, making complex learning engaging and effective. We are truly grateful for their dedication and highly recommend their services.',
      author: 'Rejith Ratnappan',
      role: 'Project Manager, Joseph Group, Dubai\nParent of Ritu Class III\nWith us since 2025',
    },
  ]

  const faqs = [
    {
      question: 'Do you teach CBSE and ICSE?',
      answer: 'Yes. We provide one-to-one online tuition for both CBSE and ICSE curricula across Classes KG - 12.',
    },
    {
      question: 'Which countries do you serve?',
      answer:
        'We serve students in India and all GCC countries including UAE, Saudi Arabia, Qatar, Kuwait, Oman and Bahrain.',
    },
    {
      question: 'How long is a typical session?',
      answer:
        'Sessions are usually 1 hour or 1.5 hours. We customise session length based on age and learning needs. If required, the durations can be adjusted to the student needs.',
    },
    {
      question: 'Do you follow the school syllabus and exam pattern?',
      answer:
        'Yes. All lessons are prepared strictly according to the latest board syllabus and exam pattern, ensuring students are well-prepared for school exams and board exams.',
    },
    {
      question: 'How are teachers or mentors assigned to students?',
      answer:
        'Each student is assigned an individual mentor based on their class, subject, learning level, and specific academic needs.',
    },
    {
      question: 'What is the frequency of each class?',
      answer: "Weekly sessions are flexible and decided based on the student's requirements and availability.",
    },
    {
      question: 'How can I enroll?',
      answer: "Click the 'Book Demo' button to contact us. We will assess your needs and schedule a demo class.",
    },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <section className="bg-white text-slate-900 py-8 px-4 md:py-12 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl translate-x-1/3 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl -translate-x-1/2 translate-y-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-16 relative z-10">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight leading-tight text-black">
              Personalised One-to-One Online Tuition <br className="hidden lg:block" /> for CBSE & ICSE Students
            </h1>

            <p className="text-lg md:text-xl text-slate-800 mb-8 max-w-2xl mx-auto md:mx-0 leading-relaxed font-medium">
              <strong>Cert-Ed Academia</strong> provides individual attention, dedicated tutors, and flexible online
              classes for students across <strong>India & GCC</strong> (UAE, Saudi Arabia, Qatar, Kuwait, Oman,
              Bahrain).
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link
                href="/contact"
                className="!bg-[#124d7e] !text-white hover:!bg-[#0f365c] font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2 text-base md:text-lg"
              >
                Book a Demo Session <ArrowRight size={20} />
              </Link>
            </div>
          </div>

          <div className="flex-1 w-full flex justify-center md:justify-end">
            <div className="relative w-full max-w-[600px] aspect-square md:aspect-[4/3] lg:aspect-square">
              <Image
                src="/child-online-learning-cbse-icse-student-india-gcc.webp"
                alt="Child attending one-to-one online tuition and writing notes on tablet"
                fill
                className="w-full h-auto object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <SectionWrapper className="bg-white text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Help your child build confidence & scores with one-to-one tuition
          </h2>
          <p className="text-xl text-gray-600 leading-relaxed">
            Our personalised classes focus on concept clarity, regular progress tracking, and parent communication.
            ideal for busy families in India and the Gulf.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/classes"
              className="!bg-[#124d7e] !text-white hover:!bg-[#0f365c] font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2 text-base md:text-lg"
            >
              Check the classes we offer <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper id="features" className="bg-gray-50 border-l-8 border-primary">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Key Features</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Why thousands of parents trust us with their child&apos;s education.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper className="bg-white">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">What Parents & Students Say</h2>
        </div>

        <TestimonialSlider testimonials={testimonials} />
      </SectionWrapper>

      <SectionWrapper className="bg-gray-100">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
        </div>

        <div className="max-w-3xl mx-auto">
          <FAQAccordion items={faqs} />
        </div>
      </SectionWrapper>

      <section className="bg-primary py-20 px-4 text-center text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Book a Demo Session</h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            Experience our teaching style first-hand. A demo helps us understand your child&apos;s needs and match the
            right tutor.
          </p>

          <Link
            href="/contact"
            className="bg-white text-primary hover:bg-gray-100 font-bold py-4 px-12 rounded-full transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 inline-flex items-center gap-2 text-lg"
          >
            Book Demo <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  )
}
