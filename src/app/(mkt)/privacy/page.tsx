import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Cert-Ed Academia',
  description:
    'How Cert-Ed Academia collects, uses, stores and protects personal data for students, guardians and staff.',
}

// DRAFT scaffold. Content is the audit draft (certed-privacy-audit-full.md, D2) and MUST be
// reviewed by a qualified advocate before this page is treated as in force. Placeholders in
// [brackets] are filled once the operating entity + grievance contact are confirmed.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-2xl font-bold text-gray-900">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPolicy() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div
          role="note"
          className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>Draft — pending legal review.</strong> This policy is being finalised with legal counsel and is not
          yet in force.
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: [date]</p>

        <p className="mt-6 text-gray-700 leading-relaxed">
          Cert-Ed Academia (&ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by <strong>[legal entity name]</strong>,
          provides an online tuition platform. This policy explains what personal data we handle and your rights under
          India&rsquo;s Digital Personal Data Protection Act, 2023, and, where applicable, the data-protection laws of
          the GCC states we serve.
        </p>

        <Section title="1. What we collect">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Students:</strong> name, email, class/level, and — where the student is a minor — a
              guardian&rsquo;s name and phone. Academic records you generate on the platform (assignments, submissions,
              grades, attendance, report cards) and files uploaded for coursework.
            </li>
            <li>
              <strong>Staff (tutors/mentors/admins):</strong> name, email, role, and professional profile details.
            </li>
            <li>
              <strong>Website enquiries:</strong> if you use our contact form, your name, email, optional phone, and
              message.
            </li>
            <li>
              <strong>Technical:</strong> a sign-in session cookie and, to prevent abuse, your IP address for
              rate-limiting. We use <strong>no advertising or analytics trackers.</strong>
            </li>
          </ul>
        </Section>

        <Section title="2. Why we use it">
          <p>
            To create and run your account, deliver and record tuition, communicate with you (and, for a minor, their
            guardian), issue receipts, keep the service secure, and meet legal obligations. We do not use
            children&rsquo;s data for tracking, behavioural monitoring, or targeted advertising.
          </p>
        </Section>

        <Section title="3. Children">
          <p>
            For students under 18, we rely on <strong>guardian consent</strong> and process their data only for
            educational and administrative purposes.
          </p>
        </Section>

        <Section title="4. Who can see it">
          <p>
            Access is restricted by role: a student sees their own records; a tutor or mentor sees only their assigned
            students; administrators manage the academy.
          </p>
        </Section>

        <Section title="5. Service providers">
          <p>We use the following providers, who process data only on our instructions:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Supabase</strong> — secure database &amp; sign-in
            </li>
            <li>
              <strong>Vercel</strong> — application hosting
            </li>
            <li>
              <strong>Google Drive</strong> — storing your uploaded files (never shared publicly)
            </li>
            <li>
              <strong>Google Apps Script / Sheets</strong> — contact-form enquiries
            </li>
            <li>
              <strong>Resend</strong> — email
            </li>
            <li>
              <strong>Sentry</strong> — error monitoring (with emails and IP addresses removed)
            </li>
          </ul>
        </Section>

        <Section title="6. Where it is stored, and transfers">
          <p>
            Your data is stored with our database provider in <strong>Singapore</strong> and processed via hosting
            infrastructure in <strong>India</strong>. Any cross-border transfer is made only as permitted under
            applicable law. [Transfer basis to be confirmed with counsel per jurisdiction.]
          </p>
        </Section>

        <Section title="7. How long we keep it">
          <p>
            For as long as your account is active and as needed for our records; specific periods are set out in our
            Data Retention Policy. Read notifications, queued emails and audit logs are purged automatically.
          </p>
        </Section>

        <Section title="8. Security">
          <p>
            Role-based access, row-level database security, encrypted transport, custodial (non-public) file storage,
            and restricted administrative access.
          </p>
        </Section>

        <Section title="9. Your rights">
          <p>
            You (or a guardian, for a minor) may <strong>access, correct, or erase</strong> your data,{' '}
            <strong>withdraw consent</strong>, <strong>nominate</strong> someone to act for you, and{' '}
            <strong>raise a grievance</strong>. To exercise any right, contact us (below); we verify identity before
            acting.
          </p>
        </Section>

        <Section title="10. Grievance and contact">
          <p>
            <strong>[Grievance officer name/role]</strong>, <strong>[grievance email]</strong>. If a concern is
            unresolved, you may approach the Data Protection Board of India (or the relevant GCC regulator).
          </p>
        </Section>

        <Section title="11. Changes">
          <p>We will post updates here and, for material changes, ask you to re-accept.</p>
        </Section>

        <p className="mt-10 text-sm text-gray-500">
          See also our{' '}
          <Link href="/terms" className="text-primary underline hover:no-underline">
            Terms of Use
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
