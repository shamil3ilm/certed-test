'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, signInWithPasswordClient } from '../auth-client'
import { assertActionOk } from '../action-client'
import { Field, Input, PasswordInput } from '../form'
import { Modal } from '../Modal'
import { registerAction } from './actions'
import { AlertBanner } from '@/lib/ui'
import { useHydratedFlag } from '@/lib/ui/client-env'

const NOT_ACCEPTED = 'Please agree to the Terms of Use and Privacy Policy to set up your account.'

/**
 * Setting up a password login, and the one place consent to the policies is given.
 *
 * The tick is REQUIRED of everyone and worded conditionally, because this form cannot know who
 * is registering: it submits email, code and password together, and whether the account belongs
 * to a student - and whether that student is a minor - is resolved server-side once the code
 * validates. So the box states the under-18 case rather than tailoring itself to it, and the
 * SERVER decides whether that tick is recorded as guardian consent (ADR-0009).
 *
 * The policy bodies arrive as ELEMENTS from the page, a server component, rather than being
 * imported here. Importing them would ship the whole Terms and Privacy text in the client
 * bundle, which sits a few KB under its budget; as props they travel in the RSC payload instead.
 * They open in a dialog rather than a link: navigating away mid-setup is how a one-time setup
 * code gets lost.
 *
 * Inert until hydrated, like the other three auth forms (see auth-forms-pre-hydration.test):
 * method=post so a native submit puts values in a BODY, and the button ships disabled so there
 * is no default control for a click or an implicit Enter to activate. This form carries a
 * password AND a one-time setup code, so a native GET submit would put both in the URL, the
 * history, the access log and any Referer.
 */
export function RegisterForm({ termsBody, privacyBody }: { termsBody: ReactNode; privacyBody: ReactNode }) {
  const router = useRouter()
  const hydrated = useHydratedFlag()
  const authAvailability = getBrowserAuthAvailability()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [policy, setPolicy] = useState<'terms' | 'privacy' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }
    // Said in the page's own voice, beside the other errors - not as a browser tooltip on a
    // checkbox, which is easy to miss and cannot be styled or read back consistently.
    if (!accepted) {
      setError(NOT_ACCEPTED)
      return
    }

    setBusy(true)
    setError(null)

    const formData = new FormData()
    formData.set('email', email)
    formData.set('code', code)
    formData.set('password', password)
    formData.set('policies_accepted', 'on')

    try {
      assertActionOk(await registerAction({ ok: true }, formData), 'Could not create account')
      await signInWithPasswordClient(email, password)
      router.push('/dashboard')
      router.refresh()
    } catch (registrationError) {
      const message = registrationError instanceof Error ? registrationError.message : 'Could not create account'
      if (message === 'Wrong email or password.') {
        router.push('/login?registered=1')
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-3">
      <Field label="Email">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Setup code" hint="The one-time code your admin gave you.">
        <Input
          required
          placeholder="8-character code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoCapitalize="characters"
        />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <PasswordInput
          required
          minLength={8}
          placeholder="Create a password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          aria-describedby="policy-consent-note"
        />
        <span id="policy-consent-note">
          I agree to the <PolicyLink onClick={() => setPolicy('terms')}>Terms of Use</PolicyLink> and{' '}
          <PolicyLink onClick={() => setPolicy('privacy')}>Privacy Policy</PolicyLink>. If the account holder is under
          18, I confirm a parent or guardian has read them and consents on their behalf.
        </span>
      </label>

      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
      <button type="submit" disabled={busy || !hydrated || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Setting up...' : 'Create account'}
      </button>

      <Modal
        open={policy !== null}
        onClose={() => setPolicy(null)}
        size="lg"
        title={policy === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
      >
        {policy === 'privacy' ? privacyBody : termsBody}
      </Modal>
    </form>
  )
}

/** Opens a policy in the dialog. A button, not an anchor: it goes nowhere, and a keyboard or
 *  screen-reader user should be told it opens a dialog rather than promised a new page. */
function PolicyLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-medium text-primary underline hover:no-underline">
      {children}
    </button>
  )
}
