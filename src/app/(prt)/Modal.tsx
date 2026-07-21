'use client'
import type { ReactNode } from 'react'

/**
 * Shared modal shell - one overlay/panel/close implementation for every dialog
 * in the portal (stat cards, calendar event details, ...). The parent owns the
 * `open` boolean; this renders nothing when closed.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  if (!open) return null
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`max-h-[80vh] w-full ${maxW} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="-m-2 grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
