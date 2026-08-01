'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, signInWithPasswordClient } from '../auth-client'
import { Field, Input, PasswordInput } from '../form'
import { AlertBanner } from '@/lib/ui'

export function PasswordLoginForm() {
  const router = useRouter()
  const authAvailability = getBrowserAuthAvailability()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        <Input
          type="email"
          required
          placeholder="you@example.com"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          required
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
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
