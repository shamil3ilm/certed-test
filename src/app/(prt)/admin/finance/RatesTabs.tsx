'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/lib/ui'

/**
 * Unified tabbed navigation for Rates & Billing administration:
 * - Hourly rates: student fees per hour and tutor pay per hour (/admin/finance/billing-rates)
 * - Currency conversion: base currency and effective-dated FX conversion rates (/admin/finance/rates)
 */
const TABS = [
  { href: '/admin/finance/billing-rates', label: 'Hourly rates' },
  { href: '/admin/finance/rates', label: 'Currency conversion' },
] as const

export function RatesTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Rates administration views" className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            scroll={false}
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
