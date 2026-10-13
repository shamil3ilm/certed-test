import type { Metadata } from 'next'
import { POLICY_EFFECTIVE_DATE } from '@/lib/policy/versions'
import { TermsBody } from '@/lib/policy/terms-body'

export const metadata: Metadata = {
  title: 'Terms of Use | Cert-Ed Academia',
  description: 'The terms that govern use of the Cert-Ed Academia online tuition platform.',
  // Unlinked is not unindexed - see the matching note in the privacy page. noindex rather
  // than a robots.txt disallow, so the crawler can still fetch the page and read it.
  robots: { index: false, follow: false },
}

// The terms themselves live in lib/policy/terms-body, shared with the consent modal on
// /register so the words a person agrees to cannot drift from the words published here.

export default function TermsOfUse() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Terms of Use</h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: {POLICY_EFFECTIVE_DATE}</p>
        <div className="mt-6">
          <TermsBody />
        </div>
      </div>
    </div>
  )
}
