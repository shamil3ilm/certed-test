import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(prt)/auth-client', () => ({
  getBrowserAuthAvailability: () => ({ ok: true, message: '' }),
  signInWithPasswordClient: vi.fn(),
}))

import { RegisterForm } from '@/app/(prt)/register/RegisterForm'
import { TermsBody } from '@/lib/policy/terms-body'
import { PrivacyBody } from '@/lib/policy/privacy-body'
import TermsPage from '@/app/(mkt)/terms/page'
import PrivacyPage from '@/app/(mkt)/privacy/page'

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, "'")
    .replace(/\s+/g, ' ')

const form = () => renderToStaticMarkup(<RegisterForm termsBody={<TermsBody />} privacyBody={<PrivacyBody />} />)

/**
 * The tick is the only place consent is given, and for a minor it is the guardian attestation
 * (ADR-0009). Its wording therefore IS the legal artefact - these assertions are about the
 * words, not the markup.
 */
describe('the register consent tick', () => {
  it('states the agreement and the under-18 attestation in one sentence', () => {
    const rendered = text(form())
    expect(rendered).toContain('I agree to the')
    expect(rendered).toContain('Terms of Use')
    expect(rendered).toContain('Privacy Policy')
    expect(rendered).toContain('If the account holder is under 18')
    expect(rendered).toContain('a parent or guardian has read them and consents on their behalf')
  })

  it('is a checkbox the person must actively tick - never pre-ticked', () => {
    const markup = form()
    expect(markup).toContain('type="checkbox"')
    // A pre-ticked consent box is not consent. Server-rendered markup must not carry `checked`.
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/)
  })

  it('opens the policies in a dialog rather than navigating away mid-setup', () => {
    const markup = form()
    // Buttons, not anchors: leaving this page is how a one-time setup code gets lost.
    expect(markup).not.toMatch(/<a [^>]*href="\/(terms|privacy)"/)
    expect(markup.match(/<button type="button"/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

/**
 * A consent row names a policy VERSION. If the dialog could show different words from the
 * published page at that version, the record would name something the person never read.
 *
 * The form's static markup cannot prove this: Modal renders null until opened, so the text is
 * correctly absent until someone asks for it. The guarantee lives one level up - BOTH surfaces
 * consume the same module - so that is what these assert: the published pages render the shared
 * bodies, and the register page hands those same bodies to the dialog.
 */
describe('the dialog and the published page cannot diverge', () => {
  it('the published Terms page renders the shared body, not its own copy', () => {
    const body = text(renderToStaticMarkup(<TermsBody />))
    const published = text(renderToStaticMarkup(<TermsPage />))

    for (const clause of ['1. Eligibility', '6. Academic resources and uploads', '12. Contact']) {
      expect(body).toContain(clause)
      expect(published).toContain(clause)
    }
  })

  it('the published Privacy page renders the shared body, not its own copy', () => {
    const body = text(renderToStaticMarkup(<PrivacyBody />))
    const published = text(renderToStaticMarkup(<PrivacyPage />))

    for (const section of ['1. What we collect', '3. Children', '7. How long we keep it']) {
      expect(body).toContain(section)
      expect(published).toContain(section)
    }
  })

  it('the shared body is the WHOLE policy, not an abridgement', () => {
    const privacy = text(renderToStaticMarkup(<PrivacyBody />))
    // Specific promises a summary would quietly drop, and which a reader may be relying on.
    expect(privacy).toContain('no advertising trackers')
    expect(privacy).toContain('withdraw consent')
    expect(privacy).toContain('parent or guardian')
  })

  it('the register page passes those same bodies to the form', () => {
    const page = readFileSync('src/app/(prt)/register/page.tsx', 'utf8')
    expect(page).toMatch(/from '@\/lib\/policy\/terms-body'/)
    expect(page).toMatch(/from '@\/lib\/policy\/privacy-body'/)
    expect(page).toMatch(/termsBody=\{<TermsBody \/>\}/)
    expect(page).toMatch(/privacyBody=\{<PrivacyBody \/>\}/)
  })

  it('neither marketing page keeps policy text of its own', () => {
    const terms = readFileSync('src/app/(mkt)/terms/page.tsx', 'utf8')
    const privacy = readFileSync('src/app/(mkt)/privacy/page.tsx', 'utf8')

    // Each page imports its body...
    expect(terms).toContain('@/lib/policy/terms-body')
    expect(privacy).toContain('@/lib/policy/privacy-body')
    // ...and holds none of the words itself, so there is only ever one copy to keep current.
    expect(terms).not.toContain('1. Eligibility')
    expect(privacy).not.toContain('1. What we collect')
    expect(privacy).not.toContain('no advertising trackers')
  })
})
