'use client'

import { useState } from 'react'
import { Field, PasswordInput, SubmitButton } from '../form'

/**
 * Change-password form with LIVE confirmation. The two fields must match before
 * the submit is enabled, and a mismatch shows an inline alert immediately - not
 * only after a server round-trip. The server action (changePasswordSchema) still
 * re-validates the match, so this is a UX layer, not the security boundary.
 *
 * Unlike the login / forgot / reset forms, these inputs stay CONTROLLED on purpose and
 * that is safe here: submission goes through a server action, which is handed the form's
 * own FormData, so the posted values are always what is on screen even if a pre-hydration
 * autofill never reached React state. The state drives only the live mismatch hint (which
 * an unsynced autofill leaves reading "match", the same answer the server then verifies).
 * Do NOT copy the controlled pattern into a form that submits from state instead.
 */
export function ChangePasswordForm({ action, helpText }: { action: (formData: FormData) => void; helpText: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Current password" className="sm:col-span-2">
        {/* Re-authentication (A-04): without it a stolen cookie alone re-keys the
            account, and the "sign out other sessions" that follows evicts the owner. */}
        <PasswordInput name="current_password" required autoComplete="current-password" />
      </Field>
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
        {/* Pending state as well as the mismatch guard - the sibling set-a-new-password
            form (login/reset) disables on both. Without it a second in-flight submit
            re-ran with a now-stale current_password and reported "wrong current password"
            for a change that had already succeeded. */}
        <SubmitButton className="btn-primary" disabled={mismatch} pendingLabel="Changing...">
          Change password
        </SubmitButton>
        <p className="mt-2 text-xs text-slate-600">{helpText}</p>
      </div>
    </form>
  )
}
