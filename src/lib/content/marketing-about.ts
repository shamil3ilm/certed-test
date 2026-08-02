import { Award, CheckCircle, Clock, Eye, Heart, Star, Target, Users, type MarketingValue } from './marketing-shared'

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
