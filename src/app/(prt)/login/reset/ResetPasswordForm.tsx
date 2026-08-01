'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserAuthAvailability, updatePasswordClient } from '../../auth-client'
import { Field, PasswordInput } from '../../form'
import { AlertBanner } from '@/lib/ui'
import { changePasswordSchema } from '@/lib/validation/user'

export function ResetPasswordForm() {
  const router = useRouter()
  const authAvailability = getBrowserAuthAvailability()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!authAvailability.ok) {
      setError(authAvailability.message)
      return
    }

    // Same rules as the in-settings change (min 8, must match) - one source of truth.
    const parsed = changePasswordSchema.safeParse({ password, confirm })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Password must be at least 8 characters and match.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      await updatePasswordClient(parsed.data.password)
      router.push('/dashboard')
      router.refresh()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update your password.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="New password">
        <PasswordInput
          required
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field label="Confirm password">
        <PasswordInput
          required
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>
      {!authAvailability.ok && <AlertBanner tone="warning">{authAvailability.message}</AlertBanner>}
      {error && <AlertBanner tone="warning">{error}</AlertBanner>}
      <button type="submit" disabled={busy || !authAvailability.ok} className="btn btn-primary w-full">
        {busy ? 'Updating...' : 'Update password'}
      </button>
    </form>
  )
}
