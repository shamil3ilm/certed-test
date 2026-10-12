/**
 * The Terms of Use in force, as data plus a renderer, so the published page and the consent
 * modal on /register show the SAME words. A consent row stores the version
 * (POLICY_EFFECTIVE_DATE) someone accepted; if page and modal could drift, that record would
 * name a version nobody read.
 *
 * The page chrome - heading, "Last updated", page width - stays with the page. This is the body
 * only, so it drops into a dialog as readily as into a document.
 *
 * No governing law, court or city is named: the operating entity and its seat are not settled.
 */
const TERMS: { title: string; body: string }[] = [
  {
    title: '1. Eligibility',
    body: 'Accounts are created by the academy; for a minor, the account is created with a parent or guardian’s consent.',
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
  {
    title: '8. Third-party services',
    body: 'The service relies on third-party service providers to operate, described in our Privacy Policy.',
  },
  { title: '9. Suspension and termination', body: 'We may suspend accounts for breach or misuse.' },
  { title: '10. Liability', body: 'Our liability is limited to the extent permitted by law.' },
  {
    title: '11. Changes',
    body: 'We may update these Terms from time to time. The updated version is posted here with a new “Last updated” date, and material changes require re-acceptance.',
  },
  {
    title: '12. Contact',
    body: 'Questions about these Terms: info@certedacademia.com.',
  },
]

export function TermsBody() {
  return (
    <div className="space-y-6">
      {TERMS.map((t) => (
        <section key={t.title}>
          <h2 className="mb-2 text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="leading-relaxed text-slate-700">{t.body}</p>
        </section>
      ))}
    </div>
  )
}
