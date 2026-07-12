'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { seg: '', label: 'Stream' },
  { seg: 'classwork', label: 'Classwork' },
  { seg: 'people', label: 'People' },
]

export function ClassTabs({ id }: { id: string }) {
  const pathname = usePathname()
  const base = `/classroom/${id}`

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base
        const active = t.seg ? pathname.startsWith(href) : pathname === base
        return (
          <Link
            key={t.label}
            href={href}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
