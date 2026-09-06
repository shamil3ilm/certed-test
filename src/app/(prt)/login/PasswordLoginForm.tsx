'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, signInWithPasswordClient } from '../auth-client'
import { Field, Input, PasswordInput } from '../form'
import { useHydratedFlag } from '@/lib/ui/client-env'
import { AlertBanner } from '@/lib/ui'

/**
 * Sign-in form.
 *
 * The fields are UNCONTROLLED and the submitted values are read from the form itself.
 * They used to be controlled inputs seeded `useState('')`, which silently dropped
 * anything entered before this island hydrated: React does not adopt a DOM value written
 * before it attaches, so the state stayed empty and the submit posted empty strings.
 * Supabase answered `400 validation_failed - missing email or phone`, and the user was
 * told "Wrong email or password." while looking at a form they could see was filled in.
 *
 * That window is not an edge case - a password manager or browser autofill writes both
 * fields the instant the markup exists, which on a cold or throttled load is routinely
 * before hydration. Reading FormData on submit takes the values the user actually sees,
 * so the race cannot arise at all. (The sibling reset/forgot forms do the same.)
 *
 * Uncontrolled inputs fixed the STATE half of that race but not the HANDLER half: before
 * hydration there is no onSubmit attached, and a <form> with no action/method natively
 * GET-submits to its own URL. Measured against a deployed build, a click in that window
 * produced:
 *
 *     /login?email=someone%40example.com&password=<the real password>
 *
 * - the password written into the address bar, browser history, the server and CDN access
 * logs, and any Referer that leaves the page - while the form cleared and no sign-in was
 * ever attempted. Two guards close it:
 *   - the submit button is disabled until useHydratedFlag() reports the island is live, so
 *     there is no default button for a click OR an implicit Enter to activate beforehand;
 *   - method=post, so if a browser ever submits anyway the values go in a request body
 *     rather than a URL. Sign-in needs JS regardless (it calls the Supabase browser
 *     client), so gating on hydration costs nothing that worked before.
 */
export function PasswordLoginForm() {
  const router = useRouter()
  const authAvailability = getBrowserAuthAvailability()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hydrated = useHydratedFlag()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Captured BEFORE any await: React nulls currentTarget once the handler yields.
    const fields = new FormData(event.currentTarget)

    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }

    const email = String(fields.get('email') ?? '')
    const password = String(fields.get('password') ?? '')

    setBusy(true)
    setError(null)

    try {
      await signInWithPasswordClient(email, password)
      router.push('/dashboard')
      router.refresh()
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Wrong email or password.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-3">
      <Field label="Email">
        <Input name="email" type="email" required placeholder="you@example.com" autoComplete="username" />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" required placeholder="Your password" autoComplete="current-password" />
      </Field>
      <div className="text-right">
        <a href="/login/forgot" className="text-xs font-medium text-primary hover:underline">
          Forgot password?
        </a>
      </div>
      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
      <button type="submit" disabled={busy || !hydrated || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
