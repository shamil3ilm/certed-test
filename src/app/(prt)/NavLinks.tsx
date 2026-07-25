'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/lib/ui'
import { NavIcon } from './NavIcon'
import type { NavItem } from './nav'

/** Desktop nav row with icons + active-route highlighting (client - needs usePathname). */
export function NavLinks({ links }: { links: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="hidden flex-wrap items-center justify-center gap-1 border-t border-gray-100 py-2 md:flex">
      {links.map((l, i) => {
        const active = pathname === l.href || pathname.startsWith(l.href + '/')
        // Set the admin cluster apart from the everyday tabs with a hairline divider.
        const startsAdminGroup = i > 0 && l.href.startsWith('/admin/') && !links[i - 1].href.startsWith('/admin/')
        return (
          <div key={l.href} className="flex items-center">
            {startsAdminGroup && <span className="mx-1.5 h-5 w-px bg-gray-200" aria-hidden="true" />}
            <Link
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition',
                active
                  ? 'bg-gradient-to-r from-primary/15 to-secondary/10 font-semibold text-primary ring-1 ring-primary/10'
                  : 'font-medium text-gray-600 hover:bg-primary/5 hover:text-primary',
              )}
            >
              <NavIcon href={l.href} />
              {l.label}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
