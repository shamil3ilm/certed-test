import type { ReactNode } from 'react'
import { cx } from '@/lib/ui'

/** Shared vertical section spacing for dashboard blocks across all personas. */
export function DashboardSection({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={cx('mt-6', className)}>{children}</section>
}

/**
 * A scope divider, shown only when one persona's dashboard stacks two DISTINCT
 * scopes - e.g. a mentor who also teaches: "Your mentees" over the pastoral block,
 * "Your classes" over the teaching block. Styled as a ruled eyebrow (not a card
 * title) so the two scopes read as separate sections rather than repetition.
 */
export function DashboardScopeHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-8 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  )
}

/** Shared widget grid rhythm for dashboard card rows. */
export function DashboardWidgetGrid({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <DashboardSection className={cx('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </DashboardSection>
  )
}
