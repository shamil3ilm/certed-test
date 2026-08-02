'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function ClassTabs({ id, canGrade }: { id: string; canGrade: boolean }) {
  const pathname = usePathname()
  const base = `/classroom/${id}`

  // Grading sits next to the classwork it marks, and only for graders - a
  // student never sees a Grading tab on their own class.
  const tabs = [
    { seg: '', label: 'Stream' },
    { seg: 'classwork', label: 'Classwork' },
    ...(canGrade ? [{ seg: 'grading', label: 'Grading' }] : []),
    { seg: 'attendance', label: 'Attendance' },
    { seg: 'people', label: 'People' },
  ]

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base
        const active = t.seg ? pathname.startsWith(href) : pathname === base
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? 'page' : undefined}
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
