import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Cert-Ed Academia',
  description:
    'How Cert-Ed Academia collects, uses, stores and protects personal data for students, guardians and staff.',
}

// Draft policy: must be reviewed by a qualified advocate before this page is treated as in
// force. Bracketed placeholders are filled once the operating entity and grievance contact
// are confirmed.

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
          <strong>Draft: pending legal review.</strong> This policy is being finalised with legal counsel and is not yet
          in force.
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
              <strong>Students:</strong> name, email, class/level, date of birth, and an optional phone number used only
              for class communication. Where the student is a minor, we also hold a guardian&rsquo;s name, phone and
              email. We keep the academic records you generate on the platform (assignments, submissions, grades,
              attendance, report cards) and the files you upload for coursework.
            </li>
            <li>
              <strong>Staff (tutors/mentors/admins):</strong> name, email, role, and professional profile details.
            </li>
            <li>
              <strong>Website enquiries:</strong> if you use our contact form, your name, email, optional phone, and
              message.
            </li>
            <li>
              <strong>Technical:</strong> essential cookies that keep you signed in and, to prevent abuse, your IP
              address for rate-limiting. We use <strong>no advertising or analytics trackers.</strong>
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
            Students are typically minors, so we process their data on the basis of a{' '}
            <strong>parent or guardian&rsquo;s consent</strong>, and only for educational and administrative purposes.
          </p>
        </Section>

        <Section title="4. Who can see it">
          <p>
            Access is restricted by role: a student sees their own records; a tutor or mentor sees only their assigned
            students; administrators manage the academy.
          </p>
        </Section>

        <Section title="5. Service providers">
          <p>
            We share personal data only with a small number of trusted service providers who help us operate the
            platform, such as hosting and our secure database, coursework-file storage, and email delivery. We share
            data with them only to run the platform, and each is bound by its own confidentiality and security terms. We
            do not sell your data or share it for advertising.
          </p>
        </Section>

        <Section title="6. Where it is stored, and transfers">
          <p>
            Your account and the records you generate on the platform are stored and processed in <strong>India</strong>
            . Files you upload are held by our file-storage provider, which may store them outside India. If you use the
            platform from outside India (for example, from a GCC state), this involves transferring your data across
            borders. We are finalising the legal basis for these transfers with legal counsel before this policy takes
            effect.
          </p>
        </Section>

        <Section title="7. How long we keep it">
          <p>
            We keep your data for as long as your account is active and as long as we need it for our records and to
            meet legal obligations. Read notifications, queued emails and audit logs are purged automatically. Specific
            retention periods are being confirmed with legal counsel.
          </p>
        </Section>

        <Section title="8. Security">
          <p>
            We protect your data with role-based access (each person sees only what their role permits), encryption in
            transit, restricted administrative access, and non-public file storage.
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
