'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPasswordClient } from '../auth-client'
import { Field, Input, PasswordInput } from '../form'

export function PasswordLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
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
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
