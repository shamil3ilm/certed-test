import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use | Cert-Ed Academia',
  description: 'The terms that govern use of the Cert-Ed Academia online tuition platform.',
}

// DRAFT scaffold. Content is the audit draft (certed-privacy-audit-full.md, D3) and MUST be
// reviewed by a qualified advocate before this page is treated as in force.

const TERMS: { title: string; body: string }[] = [
  {
    title: '1. Eligibility',
    body: 'Accounts are created by the academy; a minor’s account is set up and accepted by a guardian.',
  },
  {
    title: '2. Your account',
    body: 'Keep your credentials confidential; you are responsible for activity on your account; tell us of any misuse.',
  },
  {
    title: '3. Tutors and mentors',
    body: 'Access student data only for your assigned teaching; do not share or export it improperly.',
  },
  {
    title: '4. Students and guardians',
    body: 'Use the platform for your own learning; submitted work must be your own.',
  },
  {
    title: '5. Acceptable use',
    body: 'No unlawful, abusive, or security-compromising activity; no attempts to access others’ data.',
  },
  {
    title: '6. Academic resources and uploads',
    body: 'Materials are for personal educational use; you retain rights in work you upload and grant us a licence to store and display it to deliver the service; do not upload unlawful or sensitive third-party data.',
  },
  { title: '7. Availability', body: 'The service is provided “as is”; we may perform maintenance.' },
  { title: '8. Third-party services', body: 'The service relies on the providers listed in the Privacy Policy.' },
  { title: '9. Suspension and termination', body: 'We may suspend accounts for breach or misuse.' },
  { title: '10. Liability', body: 'Our liability is limited to the extent permitted by law.' },
  { title: '11. Changes', body: 'We may update these Terms; material changes require re-acceptance.' },
  {
    title: '12. Governing law',
    body: 'These Terms are governed by the laws of India; courts of [city]. Contact: [contact email].',
  },
]

export default function TermsOfUse() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div
          role="note"
          className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>Draft — pending legal review.</strong> These terms are being finalised with legal counsel and are not
          yet in force.
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Terms of Use</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: [date]</p>

        <div className="mt-6 space-y-6">
          {TERMS.map((t) => (
            <section key={t.title}>
              <h2 className="mb-2 text-xl font-bold text-gray-900">{t.title}</h2>
              <p className="text-gray-700 leading-relaxed">{t.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500">
          See also our{' '}
          <Link href="/privacy" className="text-primary underline hover:no-underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
