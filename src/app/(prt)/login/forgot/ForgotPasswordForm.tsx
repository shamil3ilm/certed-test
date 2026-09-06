'use client'

import { useState, type FormEvent } from 'react'
import { getBrowserAuthAvailability, requestPasswordResetClient } from '../../auth-client'
import { Field, Input } from '../../form'
import { useHydratedFlag } from '@/lib/ui/client-env'
import { AlertBanner } from '@/lib/ui'

export function ForgotPasswordForm() {
  const authAvailability = getBrowserAuthAvailability()
  // Holds the address that was actually SUBMITTED, for the confirmation copy below -
  // not a mirror of the input, which is uncontrolled (see PasswordLoginForm for why).
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hydrated = useHydratedFlag()
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Captured BEFORE any await: React nulls currentTarget once the handler yields.
    const submitted = String(new FormData(event.currentTarget).get('email') ?? '')

    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }

    setBusy(true)
    setError(null)

    try {
      await requestPasswordResetClient(submitted)
      setEmail(submitted)
      setSent(true)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not send the reset email.')
    } finally {
      setBusy(false)
    }
  }

  // Same confirmation whether or not the address has an account, so this never
  // reveals which emails are registered.
  if (sent) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a password-reset link. Check your inbox
          (and your spam folder).
        </p>
        <a href="/login" className="btn btn-soft w-full">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-3">
      <Field label="Email">
        <Input name="email" type="email" required placeholder="you@example.com" autoComplete="username" />
      </Field>
      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
      <button type="submit" disabled={busy || !hydrated || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Sending...' : 'Send reset link'}
      </button>
      <a href="/login" className="block text-center text-xs font-medium text-slate-600 hover:underline">
        Back to sign in
      </a>
    </form>
  )
}
