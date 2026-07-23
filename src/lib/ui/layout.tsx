import type { ElementType, ReactNode } from 'react'
import { CARD, cx } from './core'

/* Page and section scaffolding: the surfaces and headings every portal page
 * composes from. */

/** White content box. `interactive` adds the standard lift-on-hover. */
export function Card({
  as: As = 'div',
  interactive = false,
  className = '',
  id,
  children,
}: {
  as?: ElementType
  interactive?: boolean
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <As id={id} className={cx(CARD, interactive && 'transition hover:-translate-y-0.5 hover:shadow-md', className)}>
      {children}
    </As>
  )
}

/** Dashed placeholder shown when a list/section is empty. */
export function EmptyState({
  as: As = 'div',
  className = '',
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  return (
    <As
      className={cx(
        'rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400',
        className,
      )}
    >
      {children}
    </As>
  )
}

/** Consistent page title block used across all portal pages. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
          <span
            className="h-5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary to-secondary sm:h-6 lg:h-7"
            aria-hidden
          />
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-1 text-sm text-slate-500 sm:text-[0.95rem]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** A bordered white content panel. */
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  )
}

/** The standard responsive grid for stat tiles - 2 across on mobile, `cols` on
 *  desktop, so stat blocks share one rhythm across dashboard/users/finance. */
export function StatGrid({
  cols = 4,
  className = '',
  children,
}: {
  cols?: 3 | 4
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cx('grid grid-cols-2 gap-3 sm:gap-4', cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4', className)}
    >
      {children}
    </section>
  )
}

/** A headline metric tile. */
export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'primary'
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
