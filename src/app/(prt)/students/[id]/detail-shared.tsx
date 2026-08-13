import type { ReactNode } from 'react'

export function DriveLink({ href }: { href?: string | null }) {
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center text-xs font-medium text-primary hover:underline"
    >
      Open {'->'}
    </a>
  )
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-slate-400">{children}</p>
}

export function comparisonLabel(previous: number | null, delta: number | null): string {
  if (previous == null || delta == null) return 'No prior period to compare'
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta}% vs previous (${previous}%)`
}
