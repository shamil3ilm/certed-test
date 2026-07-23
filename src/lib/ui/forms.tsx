import type { ReactNode } from 'react'
import { cx } from './core'

/* The shared GET filter/search bar used by the Users hub, grading queue,
 * activity log and finance ledger. */

/** Standard control styling for a FilterBar input/select. Add `w-full` for a
 *  flexible search box. */
export const FILTER_CONTROL = 'mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm'

/** A labeled control inside a FilterBar. `className` sizes the field (e.g.
 *  `min-w-0 flex-1 sm:max-w-xs` for a search box). */
export function FilterField({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cx('text-xs font-medium text-slate-500', className)}>
      {label}
      {children}
    </label>
  )
}

/** A GET filter/search bar: a row of fields + Apply, with a Clear link shown when
 *  a filter is active. */
export function FilterBar({
  clearHref,
  showClear = false,
  applyLabel = 'Apply',
  className = '',
  children,
}: {
  clearHref?: string
  showClear?: boolean
  applyLabel?: string
  className?: string
  children: ReactNode
}) {
  return (
    <form className={cx('flex flex-wrap items-end gap-2', className)}>
      {children}
      <button className="btn btn-sm btn-soft">{applyLabel}</button>
      {showClear && clearHref && (
        <a href={clearHref} className="text-xs font-medium text-slate-400 hover:text-primary">
          Clear
        </a>
      )}
    </form>
  )
}
