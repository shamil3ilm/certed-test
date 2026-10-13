/**
 * The Privacy Policy text in force, as a component so that the published page and the consent
 * modal on /register render the SAME words. A consent row stores the version
 * (POLICY_EFFECTIVE_DATE) against which someone accepted; if the page and the modal could drift,
 * that record would name a version the person never read.
 *
 * The page chrome - heading, "Last updated", page width - stays with the page. This is the body
 * only, so it drops into a dialog as readily as into a document.
 *
 * States what the platform actually does and nothing more: no statute, regulator or registered
 * entity is named, and no retention period is promised beyond the deletions the platform
 * performs. Any text change here bumps POLICY_EFFECTIVE_DATE and re-asks for acceptance.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-2xl font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
    </section>
  )
}

export function PrivacyBody() {
  return (
    <div className="text-slate-700">
      <p className="mt-6 text-slate-700 leading-relaxed">
        Cert-Ed Academia (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an online tuition platform. This policy explains
        what personal data we handle, why, and the choices you have about it.
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
            <strong>Technical:</strong> essential cookies that keep you signed in and, to prevent abuse, your IP address
            for rate-limiting. We use cookie-less, aggregate analytics on our public pages, and{' '}
            <strong>no advertising trackers.</strong>
          </li>
        </ul>
      </Section>

      <Section title="2. Why we use it">
        <p>
          To create and run your account, deliver and record tuition, communicate with you (and, for a minor, their
          guardian), issue receipts, keep the service secure, and meet legal obligations. We do not use children&rsquo;s
          data for tracking, behavioural monitoring, or targeted advertising.
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
          We share personal data only with a small number of trusted service providers who help us operate the platform,
          such as hosting and our secure database, coursework-file storage, and email delivery. We share data with them
          only to run the platform, and each is bound by its own confidentiality and security terms. We do not sell your
          data or share it for advertising.
        </p>
      </Section>

      <Section title="6. Where it is stored, and transfers">
        <p>
          Your account and the records you generate on the platform are stored and processed in <strong>India</strong>.
          Coursework files you upload are held in the academy&rsquo;s own storage account with our file-storage
          provider, which may keep them outside India. If you use the platform from outside India (for example, from a
          GCC state), using it transfers your data to India. Accepting this policy when your account is set up covers
          that transfer, and we record that acceptance, with its date and version, against your account.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <p>
          We keep your data for as long as your account is active, and afterwards only as long as we need it for our
          records and to meet legal obligations - financial records such as receipts, for example, must be kept for the
          periods tax law requires. Some data is deleted automatically on a schedule: notifications you have read after{' '}
          <strong>90 days</strong>, our record of sent emails after <strong>7 days</strong>, the security audit log
          after <strong>24 months</strong>, and anti-abuse counters within the hour. If we set a fixed period for
          academic or financial records, we will state it here.
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
          <strong>Academy Administrator</strong>,{' '}
          <a className="text-primary hover:underline" href="mailto:info@certedacademia.com">
            info@certedacademia.com
          </a>
          . Write to us about access, correction, erasure, withdrawing consent, or any complaint about how we handle
          your data. If a concern is unresolved, you may raise it with the relevant data-protection authority.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>
          This is the version in force. We may update it from time to time - for example when our registered entity
          details, retention periods or service providers change. Updates are posted here with a new &ldquo;Last
          updated&rdquo; date, and for material changes we ask you to accept the new version.
        </p>
      </Section>
    </div>
  )
}
