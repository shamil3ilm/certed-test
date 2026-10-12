import type { Metadata } from 'next'
import { POLICY_EFFECTIVE_DATE } from '@/lib/policy/versions'
import { PrivacyBody } from '@/lib/policy/privacy-body'

export const metadata: Metadata = {
  title: 'Privacy Policy | Cert-Ed Academia',
  description:
    'How Cert-Ed Academia collects, uses, stores and protects personal data for students, guardians and staff.',
  // Unlinked is not unindexed. Nothing links here, but the page stays reachable by URL, so
  // noindex is what keeps it out of search results while the academy decides where to link it.
  // Deliberately NOT a robots.txt disallow: a crawler barred from fetching the page never sees
  // this directive, and the URL can remain indexed from outside links.
  robots: { index: false, follow: false },
}

// The text itself lives in lib/policy/privacy-body, shared with the consent modal on /register
// so the words a person agrees to cannot drift from the words published here.

export default function PrivacyPolicy() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: {POLICY_EFFECTIVE_DATE}</p>
        <PrivacyBody />
      </div>
    </div>
  )
}
