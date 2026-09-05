'use client'

import { useState } from 'react'
import { Field, PasswordInput } from '../form'

/**
 * Change-password form with LIVE confirmation. The two fields must match before
 * the submit is enabled, and a mismatch shows an inline alert immediately - not
 * only after a server round-trip. The server action (changePasswordSchema) still
 * re-validates the match, so this is a UX layer, not the security boundary.
 */
export function ChangePasswordForm({ action, helpText }: { action: (formData: FormData) => void; helpText: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="New password">
        <PasswordInput
          name="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field label="Confirm password">
        <PasswordInput
          name="confirm"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={mismatch || undefined}
        />
      </Field>
      {mismatch && (
        <p role="alert" className="text-xs text-red-600 sm:col-span-2">
          Passwords do not match.
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={mismatch} className="btn btn-primary">
          Change password
        </button>
        <p className="mt-2 text-xs text-slate-600">{helpText}</p>
      </div>
    </form>
  )
}
