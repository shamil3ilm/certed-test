import {
  Award,
  BookOpen,
  CheckCircle,
  Clock,
  Eye,
  Heart,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

type MarketingFeature = {
  icon: LucideIcon
  title: string
  description: string
}

type MarketingTestimonial = {
  quote: string
  author: string
  role: string
}

type MarketingFaq = {
  question: string
  answer: string
}

type MarketingBlogSummary = {
  slug: string
  title: string
  excerpt: string
  image: string
  date: string
  category: string
}

export type MarketingClassStep = {
  title: string
  description: string
}

export type MarketingClassLevel = {
  title: string
  description: string
}

export type MarketingValue = {
  icon: LucideIcon
  title: string
  description: string
}

export const MARKETING_FEATURES: MarketingFeature[] = [
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
    description: 'Schedule sessions that suit your timezone. We support timings for India and all major GCC countries.',
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
    description: 'Feedbacks, reports and parent calls help you track improvements and adapt learning plans as needed.',
  },
  {
    icon: ShieldCheck,
    title: 'Safe & Secure Online Learning',
    description:
      'Verified tutors, secure video sessions, and child-friendly material ensure a safe learning environment.',
  },
]

export const MARKETING_TESTIMONIALS: MarketingTestimonial[] = [
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
    role: 'Software Developer, Innovo Group, Dubai\nParent of Takshvi Class I\nCBSE | 2025-2026',
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
    role: 'General Manager, MEPFLOW Engineering Equipment Trading LLC, Dubai\nParent of Evan (Class X), Sarah (Class II) & Mathew (Class VI)\nCBSE | 2025-2026',
  },
  {
    quote:
      'I studied Physics and Chemistry with Cert-Ed. The one-on-one sessions helped me ask doubts without hesitation, and explained ideas in simple steps. Weekly practice and clear notes made revision easy, and my scores improved over the year. I have never been able to score this well because Physics has always been one of the toughest subject for me but my teacher helped me really well with the basics and prepared me well for my 10th. My mentor was always patient and kept me on track; she built a bridge between me and my teachers, making expectations clearer and my study plan steadier. Thank you for the focused guidance, it made a real difference.',
    author: 'Diya Lakshmi',
    role: 'Student Class IX\nICSE | 2025-2026',
  },
  {
    quote:
      'My daughter has been taking one-on-one classes at Cert-Ed Academia for the past 3 years. The personalized attention lets lessons move at her pace, clears doubts on the spot, and adapts to her learning style. Her confidence and recent scores have improved noticeably. We get regular feedback, and the flexible timings make it easy to balance school and other activities.',
    author: 'Dhanya Menon',
    role: 'Parent of Diya Salesh Class VII to X\nCBSE | With us since 2023',
  },
  {
    quote:
      'I am very happy with the support my child received from Cert-Ed Academia. The Physics and Chemistry classes were very clear, and my child was able to understand the concepts well. The Mathematics classes were also good and helped build a strong understanding, though my child felt there could have been a few more Previous Year Questions discussed. All the teachers were excellent, supportive, and approachable. Their teaching style made it easier for my child to understand the topics and feel more confident. Overall, we had a very positive experience with Cert-Ed Academia. Thank you!',
    author: 'Mohammed Rafi',
    role: 'Parent of Rizwan Class XII\nCBSE | 2025-2026',
  },
  {
    quote:
      'The classes were good. It really helped him understand the concepts. The teacher took the initiative to ensure he understood everything. Revisions and tests were also properly done to make sure that he was able to recollect the concepts.',
    author: 'Parent of Achind Class XII',
    role: 'CBSE | 2024-2025',
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
    role: 'Punjab National Bank\nParent of Vyga Sunish Class IX\nCBSE | 2021-2022',
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

export const MARKETING_FAQS: MarketingFaq[] = [
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

export const MARKETING_BLOGS: MarketingBlogSummary[] = [
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
    title: 'CBSE and ICSE Answer Writing Tips: Write Smart and Score More',
    excerpt:
      'Learn effective CBSE and ICSE answer writing tips to improve presentation, highlight keywords, structure answers clearly, and score higher.',
    image: '/blogs/answer-writing-tips-cover.svg',
    date: 'January 12, 2026',
    category: 'Exam Tricks',
    slug: 'cbse-icse-answer-writing-tips',
  },
]

export const MARKETING_CLASS_STEPS: MarketingClassStep[] = [
  {
    title: 'Step 1 - Book a Demo Session',
    description: 'Parents request a demo class to experience teaching style and check the tutor match.',
  },
  {
    title: 'Step 2 - Tutor Assignment',
    description:
      'We assign an experienced CBSE or ICSE tutor and a mentor who oversees progress and communicates with parents.',
  },
  {
    title: 'Step 3 - Live One-to-One Classes',
    description: 'Interactive live sessions with concept clarity, examples, and regular practice.',
  },
  {
    title: 'Step 4 - Assessment',
    description: 'A short assessment helps identify learning gaps and prepares a personalised plan.',
  },
  {
    title: 'Step 5 - Review and Improve',
    description:
      'Monthly reports, tests, and parent feedback calls ensure measurable improvement and plan adjustments.',
  },
]

export const MARKETING_CLASS_LEVELS: MarketingClassLevel[] = [
  {
    title: 'Classes KG-5 (Primary)',
    description:
      'Focus on reading, writing, arithmetic, and basic concepts through activity-based learning and frequent feedback.',
  },
  {
    title: 'Classes 6-8 (Middle School)',
    description: 'Concept clarity, problem-solving, and homework support across Maths, Science, and Languages.',
  },
  {
    title: 'Classes 9-10 (High School)',
    description:
      'Exam-focused teaching, sample paper practice, doubt clearing and chapter-wise assessments for CBSE and ICSE boards.',
  },
  {
    title: 'Classes 11-12 (Senior Secondary)',
    description:
      'Advanced subject tuition, stream-specific coaching (Science, Commerce, Humanities), and college-prep support if required.',
  },
]

export const MARKETING_SUBJECTS = [
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
] as const

export const MARKETING_VALUES: MarketingValue[] = [
  {
    icon: Heart,
    title: 'Student-first',
    description: "Every decision is made for the student's progress and well-being.",
  },
  {
    icon: CheckCircle,
    title: 'Transparency',
    description: 'Clear communication and regular reports for parents.',
  },
  {
    icon: Star,
    title: 'Quality',
    description: 'Experienced tutors and curriculum-aligned lessons.',
  },
  {
    icon: Clock,
    title: 'Flexibility',
    description: 'Timings and learning plans tailored to each family.',
  },
]

export const MARKETING_ABOUT_ICONS = {
  mission: Target,
  vision: Eye,
  team: Users,
  tutor: Award,
}
