import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from './core'

/* The shared GET filter/search bar used by the Users hub, grading queue,
 * activity log and finance ledger. */

/** Standard control styling for a FilterBar input/select. Add `w-full` for a
 *  flexible search box. */
export const FILTER_CONTROL = 'mt-1 block rounded border border-slate-200 px-2 py-1.5 text-sm'

/** Standard width treatment for the primary search field in a FilterBar. */
export const FILTER_SEARCH_FIELD = 'min-w-0 flex-[2_1_18rem] sm:min-w-[18rem]'

/** A labeled control inside a FilterBar. `className` sizes the field. */
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
    <label className={cx('text-xs font-medium text-slate-600', className)}>
      {label}
      {children}
    </label>
  )
}

/** Shared search field for FilterBar layouts. Keeps the label, width treatment,
 *  and control styling consistent across portal search/filter screens. */
export function SearchFilterField({
  label = 'Search',
  className = '',
  inputClassName = '',
  ...props
}: {
  label?: string
  className?: string
  inputClassName?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FilterField label={label} className={cx(FILTER_SEARCH_FIELD, className)}>
      <input type="search" className={cx(FILTER_CONTROL, 'w-full', inputClassName)} {...props} />
    </FilterField>
  )
}

/** Shared select field for FilterBar layouts. Keeps label spacing and select
 *  styling identical across portal filter screens. */
export function SelectFilterField({
  label,
  className = '',
  selectClassName = '',
  children,
  ...props
}: {
  label: string
  className?: string
  selectClassName?: string
  children: ReactNode
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FilterField label={label} className={className}>
      <select className={cx(FILTER_CONTROL, selectClassName)} {...props}>
        {children}
      </select>
    </FilterField>
  )
}

/** Shared date field for FilterBar layouts. */
export function DateFilterField({
  label,
  className = '',
  inputClassName = '',
  ...props
}: {
  label: string
  className?: string
  inputClassName?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <FilterField label={label} className={className}>
      <input type="date" className={cx(FILTER_CONTROL, inputClassName)} {...props} />
    </FilterField>
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
      <button type="submit" className="btn btn-sm btn-soft">
        {applyLabel}
      </button>
      {showClear && clearHref && (
        <a href={clearHref} className="text-xs font-medium text-slate-600 hover:text-primary">
          Clear
        </a>
      )}
    </form>
  )
}
