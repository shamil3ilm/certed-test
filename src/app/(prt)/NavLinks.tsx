'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from './ui'
import type { NavItem } from './nav'

/** Desktop nav row with active-route highlighting (client — needs usePathname). */
export function NavLinks({ links }: { links: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="hidden flex-wrap items-center justify-center gap-1 border-t border-gray-100 py-2 md:flex">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + '/')
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 hover:bg-primary/5 hover:text-primary',
            )}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
