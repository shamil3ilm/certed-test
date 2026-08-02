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

export { Award, BookOpen, CheckCircle, Clock, Eye, Heart, ShieldCheck, Star, Target, TrendingUp, UserCheck, Users }

export type MarketingFeature = {
  icon: LucideIcon
  title: string
  description: string
}

export type MarketingTestimonial = {
  quote: string
  author: string
  role: string
}

export type MarketingFaq = {
  question: string
  answer: string
}

export type MarketingBlogSummary = {
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
