'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Settings, LogOut } from 'lucide-react'
import { initials } from '@/lib/ui'
import { LogoutForm } from './LogoutForm'

export function ProfileMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes the menu and returns focus to the trigger, so a keyboard user isn't left
    // with focus stranded inside a dismissed menu.
    //
    // Guarded on `open`, and that guard is load-bearing: the listener is on `document`, so
    // without it EVERY Escape in the portal pulled focus to this avatar - including the one
    // that dismisses a dialog, which had just restored focus to whatever opened it. The
    // account menu would silently win that race on every modal in the app.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const badge = initials(name || email)

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-sm font-semibold text-white shadow-sm ring-2 ring-white transition hover:scale-105 hover:shadow-md"
      >
        {badge}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-600">
              {email} - {roleLabel}
            </p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-primary/5 hover:text-primary"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Profile &amp; settings
          </Link>
          <LogoutForm className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger-ink transition hover:bg-danger-surface">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </LogoutForm>
        </div>
      )}
    </div>
  )
}
