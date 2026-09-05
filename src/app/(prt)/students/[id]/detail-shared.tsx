import type { ReactNode } from 'react'
import { safeExternalHref } from '@/lib/validation/url'

export function DriveLink({ href }: { href?: string | null }) {
  // Route through safeExternalHref like every other link render, so a stored
  // non-http(s) scheme (javascript:/data:) on a legacy or resource row can never emit
  // a clickable href. This page is staff-facing, so the reader is a tutor/admin.
  const safe = safeExternalHref(href ?? null)
  if (!safe) return null

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center text-xs font-medium text-primary hover:underline"
    >
      Open {'->'}
    </a>
  )
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-slate-600">{children}</p>
}

export function comparisonLabel(previous: number | null, delta: number | null): string {
  if (previous == null || delta == null) return 'No prior period to compare'
  const prefix = delta > 0 ? '+' : ''
  return `${prefix}${delta}% vs previous (${previous}%)`
}
