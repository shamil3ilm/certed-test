'use client'
import { useFormStatus } from 'react-dom'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './ui'

/**
 * Shared form primitives — the single home for input/select/textarea styling
 * and the submit button, instead of re-typing the class strings in every form
 * (they had drifted into two inconsistent styles across ~8 files).
 */

const FIELD =
  'block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 transition focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50'

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
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, className)} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(FIELD, className)}>
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
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={cx('btn', className || 'btn-primary')}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  )
}
