'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string }

export function MobileNav({ links }: { links: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-dvh w-64 flex-col bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cert-ed-academia-online-tuition-logo.webp" alt="Cert-Ed Academia" className="h-8 w-auto object-contain" />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">✕</button>
            </div>
            <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + '/')
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary'
                        : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-primary/5 hover:text-primary'
                    }
                  >
                    {l.label}
                  </Link>
                )
              })}
            </nav>
            <a
              href="/api/logout"
              className="mt-2 rounded-lg border border-primary/30 px-3 py-2 text-center text-sm font-medium text-primary hover:bg-primary/5"
            >
              Sign out
            </a>
          </aside>
        </div>
      )}
    </>
  )
}
