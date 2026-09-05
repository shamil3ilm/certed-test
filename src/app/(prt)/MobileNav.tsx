'use client'
import { Fragment, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/lib/ui'
import { useFocusTrap } from '@/lib/ui/use-focus-trap'
import { LogoutForm } from './LogoutForm'
import { NavIcon } from './NavIcon'
import { NAV_GROUP_LABELS, type NavItem } from './nav'

export function MobileNav({ links }: { links: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const panelRef = useRef<HTMLElement>(null)
  useFocusTrap(panelRef, { active: open, onEscape: () => setOpen(false) })
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="-ml-1 grid h-11 w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute left-0 top-0 flex h-dvh w-[min(16rem,calc(100vw-1rem))] flex-col bg-white p-4 shadow-xl focus:outline-none"
          >
            <div className="flex items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cert-ed-academia-online-tuition-logo.webp"
                alt="Cert-Ed Academia"
                className="h-8 w-auto object-contain"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="-mr-1 grid h-11 w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {links.map((l, i) => {
                const active = pathname === l.href || pathname.startsWith(l.href + '/')
                // A section heading before each cluster's first item - the mobile menu
                // holds 13+ items for an admin, so the groups aid scanning.
                const startsGroup = i === 0 || l.group !== links[i - 1].group
                return (
                  <Fragment key={l.href}>
                    {startsGroup && (
                      <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-600 first:pt-0">
                        {NAV_GROUP_LABELS[l.group]}
                      </p>
                    )}
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                        active
                          ? 'bg-gradient-to-r from-primary/15 to-secondary/10 font-semibold text-primary ring-1 ring-primary/10'
                          : 'font-medium text-slate-600 hover:bg-primary/5 hover:text-primary',
                      )}
                    >
                      <NavIcon href={l.href} />
                      {l.label}
                    </Link>
                  </Fragment>
                )
              })}
            </nav>
            <LogoutForm className="mt-2 w-full rounded-lg border border-primary/30 px-3 py-2 text-center text-sm font-medium text-primary hover:bg-primary/5">
              Sign out
            </LogoutForm>
          </aside>
        </div>
      )}
    </>
  )
}
