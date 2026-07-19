'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPasswordClient } from '../auth-client'
import { assertActionOk } from '../action-client'
import { Field, Input, PasswordInput } from '../form'
import { registerAction } from './actions'

export function RegisterForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const formData = new FormData()
    formData.set('email', email)
    formData.set('code', code)
    formData.set('password', password)

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
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Setting up...' : 'Create account'}
      </button>
    </form>
  )
}
