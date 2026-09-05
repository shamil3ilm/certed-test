'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, signInWithPasswordClient } from '../auth-client'
import { assertActionOk } from '../action-client'
import { Field, Input, PasswordInput } from '../form'
import { registerAction } from './actions'
import { AlertBanner } from '@/lib/ui'

export function RegisterForm() {
  const router = useRouter()
  const authAvailability = getBrowserAuthAvailability()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [guardianConsent, setGuardianConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }

    setBusy(true)
    setError(null)

    const formData = new FormData()
    formData.set('email', email)
    formData.set('code', code)
    formData.set('password', password)
    if (guardianConsent) formData.set('guardian_consent', 'on')

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
    <form onSubmit={onSubmit} className="space-y-3">
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
          checked={guardianConsent}
          onChange={(event) => setGuardianConsent(event.target.checked)}
        />
        <span>
          If the account holder is under 18, I confirm a parent or guardian has read and agrees to the{' '}
          <a href="/terms" className="text-primary underline hover:no-underline">
            Terms of Use
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-primary underline hover:no-underline">
            Privacy Policy
          </a>{' '}
          on their behalf.
        </span>
      </label>
      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
      <button type="submit" disabled={busy || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Setting up...' : 'Create account'}
      </button>
    </form>
  )
}
