import type { MarketingClassLevel, MarketingClassStep } from './marketing-shared'

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
