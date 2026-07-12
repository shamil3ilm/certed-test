'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registerAction } from './actions'
import { Field, Input } from '../form'

export function RegisterForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.set('email', email)
    fd.set('code', code)
    fd.set('password', password)
    const res = await registerAction({}, fd)
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    // Auto sign-in with the new password; fall back to the login page if that fails.
    const { error: signInErr } = await createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (signInErr) {
      router.push('/login?registered=1')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Setup code" hint="The one-time code your admin gave you.">
        <Input required value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Setting up…' : 'Create account'}
      </button>
    </form>
  )
}
