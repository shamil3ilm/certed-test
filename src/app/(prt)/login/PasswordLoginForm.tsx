'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Field, Input } from '../form'

export function PasswordLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      setError('Wrong email or password.')
      setBusy(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
