import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * The three auth forms must be inert until their island hydrates.
 *
 * They are client islands, so between first paint and hydration the markup is on screen
 * with no onSubmit attached. A <form> with no action/method natively GET-submits to its own
 * URL, so a click or an Enter in that window serialises the fields into the query string.
 * Measured against a deployed build, that produced
 * `/login?email=...&password=<the real password>` - the password in the address bar,
 * browser history, the access log and any Referer - while the form cleared and no sign-in
 * was attempted.
 *
 * Two guards, both asserted here on the SERVER-RENDERED markup, which is exactly what the
 * browser holds during that window:
 *   - method="post", so a native submit puts values in a body rather than a URL;
 *   - the submit button ships disabled (useHydratedFlag() is false on the server), so there
 *     is no default button for a click or an implicit Enter to activate.
 *
 * WHY NOT AN E2E TEST: the E2E suite runs in MOCK mode, and login/page.tsx returns
 * <DevLogin /> there - the suite never renders these components at all. A mock-mode spec
 * would pass against the broken code (verified: it did), which is worse than no test. The
 * staging suite covers the live behaviour; this covers every commit.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

// Auth availability is a browser-env probe; the form renders either way and the guards
// under test are independent of it.
vi.mock('@/app/(prt)/auth-client', () => ({
  getBrowserAuthAvailability: () => ({ ok: true, message: '' }),
  signInWithPasswordClient: vi.fn(),
  requestPasswordResetClient: vi.fn(),
  updatePasswordClient: vi.fn(),
}))

import { PasswordLoginForm } from '@/app/(prt)/login/PasswordLoginForm'
import { ForgotPasswordForm } from '@/app/(prt)/login/forgot/ForgotPasswordForm'
import { ResetPasswordForm } from '@/app/(prt)/login/reset/ResetPasswordForm'

const FORMS: Array<[string, () => string]> = [
  ['sign-in', () => renderToStaticMarkup(<PasswordLoginForm />)],
  ['forgot-password', () => renderToStaticMarkup(<ForgotPasswordForm />)],
  ['reset-password', () => renderToStaticMarkup(<ResetPasswordForm />)],
]

describe('auth forms are inert before hydration', () => {
  it.each(FORMS)('%s posts rather than serialising fields into a URL', (_name, render) => {
    expect(render()).toMatch(/<form[^>]*method="post"/i)
  })

  it.each(FORMS)('%s ships its submit button disabled', (_name, render) => {
    const html = render()
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/i)?.[0] ?? ''
    expect(submit, 'no submit button found in the rendered markup').not.toBe('')
    expect(submit, 'the button must be disabled until the island hydrates').toMatch(/disabled/)
  })

  it('the rendered markup carries no value attributes that could strand a pre-hydration edit', () => {
    // The other half of the same race: controlled inputs seeded useState('') dropped anything
    // typed before React attached. Uncontrolled inputs emit no value attribute at all.
    const html = renderToStaticMarkup(<PasswordLoginForm />)
    const inputs = html.match(/<input[^>]*>/g) ?? []
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) expect(input, `${input} is controlled`).not.toMatch(/\svalue="/)
  })
})
