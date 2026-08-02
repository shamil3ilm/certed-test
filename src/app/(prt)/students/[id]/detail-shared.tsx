import type { ReactNode } from 'react'
import { cx } from '@/lib/ui'

export function StatusChip({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate'; children: ReactNode }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

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
