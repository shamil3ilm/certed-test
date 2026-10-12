import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import Navbar from '@/app/components/Navbar'
import Footer from '@/app/components/Footer'

/**
 * The marketing site is set in Inter. It is loaded HERE rather than in the root layout so the
 * portal, which uses the brand sans, never downloads a face it does not render. `.mkt-scope` in
 * globals.css applies it to everything below, headings included.
 */
const marketingSans = Inter({ subsets: ['latin'], variable: '--font-mkt-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'Cert-Ed Academia | Online Tuition for CBSE & ICSE Students',
  description:
    'Cert-Ed Academia offers personalised one-to-one online tuition for CBSE and ICSE students. Expert tutors, flexible timings, and exam-focused learning for students in India and GCC.',
  keywords: [
    'online tuition',
    'CBSE tuition',
    'ICSE tuition',
    'one-to-one classes',
    'online classes India',
    'online tuition GCC',
    'personalised learning',
    'student mentoring',
  ],
  openGraph: {
    title: 'Cert-Ed Academia',
    description: 'Personalised online tuition for CBSE & ICSE students',
    url: 'https://www.certedacademia.com',
    siteName: 'Cert-Ed Academia',
    type: 'website',
  },
}

/**
 * Measurement is mounted HERE, on the marketing group, and deliberately not in the root layout.
 *
 * The root layout also wraps the portal, whose users are signed-in students and tutors, some of
 * them minors - behavioural data about children is a DPDP question before it is a product one,
 * and the privacy page does not currently claim to collect it. The marketing pages are public
 * and anonymous, which is where traffic measurement belongs.
 *
 * Both scripts are served from this origin (/_vercel/...), so the marketing CSP admits them
 * under `script-src 'self'` with no policy change, and they report to the same origin under
 * `connect-src 'self'`. A PORTAL_ONLY deploy never renders this group at all, so a preview or
 * staging host collects nothing.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${marketingSans.variable} mkt-scope min-h-screen flex flex-col bg-white text-slate-900`}>
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
      <Analytics />
      <SpeedInsights />
    </div>
  )
}
