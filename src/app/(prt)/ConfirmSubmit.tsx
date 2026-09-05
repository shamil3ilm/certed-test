'use client'
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useUI } from './Providers'

/**
 * A submit button for server-action <form>s that shows a confirm/warning modal
 * first, then submits the parent form only if the user confirms.
 *
 * It carries the same pending state as SubmitButton (useFormStatus): confirming
 * an action is exactly when feedback matters most, and without it the two
 * heaviest actions in the app - revoking and erasing an account - looked inert
 * after the modal closed. Pending also DISABLES the button, so a slow action
 * can't be fired twice by an impatient second click.
 *
 * `aria-label` names the specific record the action targets. In a list every row
 * renders the same visible word ("Remove", "Revoke"), so without it neither a
 * screen reader nor an automated test can tell one row's button from another's.
 * Keep the visible label as a prefix of the aria-label (WCAG 2.5.3 Label in Name).
 */
export function ConfirmSubmit({
  children,
  className,
  title,
  message,
  confirmLabel,
  pendingLabel,
  variant = 'danger',
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  className?: string
  title: string
  message?: string
  confirmLabel?: string
  pendingLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  'aria-label'?: string
}) {
  const { confirm } = useUI()
  const { pending } = useFormStatus()
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      disabled={pending}
      onClick={async (e) => {
        const form = e.currentTarget.closest('form')
        if (!form) return
        if (await confirm({ title, message, confirmLabel, variant })) form.requestSubmit()
      }}
    >
      {pending ? (pendingLabel ?? 'Working...') : children}
    </button>
  )
}
