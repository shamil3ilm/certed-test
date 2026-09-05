'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, signInWithPasswordClient } from '../auth-client'
import { Field, Input, PasswordInput } from '../form'
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
 */
export function PasswordLoginForm() {
  const router = useRouter()
  const authAvailability = getBrowserAuthAvailability()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    <form onSubmit={onSubmit} className="space-y-3">
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
      <button type="submit" disabled={busy || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
