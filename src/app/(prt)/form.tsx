'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cx } from '@/lib/ui'

/**
 * Shared form primitives - the single home for input/select/textarea styling
 * and the submit button, instead of re-typing the class strings in every form
 * (they had drifted into two inconsistent styles across ~8 files).
 */

const FIELD =
  'block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50'

const SELECT_FIELD = cx(FIELD, 'select-control')

/** Labelled field wrapper. */
export function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cx('block space-y-1', className)}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-600">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, className)} />
}

/** Password field with a show/hide toggle. Don't pass `type` - it's managed here. */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cx(FIELD, 'pr-10', className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center rounded pr-3 text-slate-600 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(SELECT_FIELD, className)}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, className)} />
}

/**
 * Submit button for a server-action `<form>`: automatically shows a pending
 * state via useFormStatus, so every action form gets consistent feedback
 * instead of silently resetting.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
  /** Additional reason to block submission (e.g. client-side validation), ORed with pending. */
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled} className={cx('btn', className || 'btn-primary')}>
      {pending ? (pendingLabel ?? 'Working...') : children}
    </button>
  )
}
