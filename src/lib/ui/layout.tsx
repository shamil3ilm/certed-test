import type { ElementType, ReactNode } from 'react'
import Link from 'next/link'
import { CARD, cx } from './core'

/** The one "go back to the parent list" link used at the top of every detail
 *  page: a left arrow + "Back to <where>", muted, sliding a touch on hover. One
 *  source so the arrow, wording style, spacing and tap target stay identical
 *  everywhere rather than each page hand-rolling its own. Pass the destination
 *  phrase as children, e.g. "Back to messages". */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:-translate-x-0.5 hover:text-primary"
    >
      {/* A stroked SVG arrow, not the thin `←` glyph, so it stays crisp and clearly
          visible at this small size (the glyph rendered faint in muted grey). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M13 8H3m4-4L3 8l4 4" />
      </svg>
      {children}
    </Link>
  )
}

/* Page and section scaffolding: the surfaces and headings every portal page
 * composes from. */

/** Inline page banner for an action result. `error`/`warning` announce via
 *  role="alert", `success` via role="status" - one place for the tone, spacing
 *  and a11y so the banners across the portal (and the auth forms) stay identical.
 *  `warning` is the amber tone the login/register/add-user forms use. */
export function AlertBanner({
  tone = 'error',
  className = '',
  children,
}: {
  tone?: 'error' | 'warning' | 'success'
  className?: string
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    error: 'bg-red-50 text-red-700',
    warning: 'border border-amber-200 bg-amber-50 text-amber-700',
    success: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <p
      role={tone === 'success' ? 'status' : 'alert'}
      className={cx('rounded-lg px-3 py-2 text-sm', tones[tone], className)}
    >
      {children}
    </p>
  )
}

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
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
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

/** A headline metric tile. Pass `href` to make it a navigable card (keyboard
 *  focusable, with a hover lift + arrow affordance); otherwise it's static. */
export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  href,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'primary'
  href?: string
}) {
  const base = cx(
    'block rounded-2xl border p-4 shadow-sm',
    tone === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-white',
  )
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {href && (
          <svg
            className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
      <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </>
  )
  if (!href) return <div className={base}>{inner}</div>
  return (
    <Link
      href={href}
      className={cx(
        base,
        'group min-h-24 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      )}
    >
      {inner}
    </Link>
  )
}
