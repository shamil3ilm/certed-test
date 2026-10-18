'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/lib/ui'

/**
 * The two views of one destination, for a reader who can open both: the monthly totals, and
 * the session record they are computed from. The totals come first because that is where the
 * Class hours nav item lands; Sessions is where a wrong time gets corrected, which then moves
 * the totals.
 *
 * Each tab is its own route with its own capability guard, so the parent renders this only
 * when the reader holds BOTH (manageClasses for the totals, viewMentees for the sessions) - a
 * mentor, who has the sessions alone, never sees a strip offering a tab that would refuse them.
 */
const TABS = [
  { href: '/admin/teaching-hours', label: 'Monthly totals' },
  { href: '/session-timings', label: 'Sessions' },
] as const

export function ClassHoursTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Class hours views" className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
