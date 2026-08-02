'use client'
import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/lib/ui/use-focus-trap'

/**
 * Shared modal shell - one overlay/panel/close implementation for every dialog
 * in the portal (stat cards, calendar event details, ...). The parent owns the
 * `open` boolean; this renders nothing when closed. Focus is trapped inside the
 * panel while open, Escape closes it, and focus returns to the trigger on close.
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
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, { active: open, onEscape: onClose })
  if (!open) return null
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`max-h-[calc(100dvh-2rem)] w-full ${maxW} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl focus:outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid min-h-10 min-w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
