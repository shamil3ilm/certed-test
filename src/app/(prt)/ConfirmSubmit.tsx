'use client'
import type { ReactNode } from 'react'
import { useUI } from './Providers'

/**
 * A submit button for server-action <form>s that shows a confirm/warning modal
 * first, then submits the parent form only if the user confirms.
 */
export function ConfirmSubmit({
  children,
  className,
  title,
  message,
  confirmLabel,
  variant = 'danger',
}: {
  children: ReactNode
  className?: string
  title: string
  message?: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
}) {
  const { confirm } = useUI()
  return (
    <button
      type="button"
      className={className}
      onClick={async (e) => {
        const form = e.currentTarget.closest('form')
        if (!form) return
        if (await confirm({ title, message, confirmLabel, variant })) form.requestSubmit()
      }}
    >
      {children}
    </button>
  )
}
