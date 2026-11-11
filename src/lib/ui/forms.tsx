'use client'

import {
  useTransition,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cx } from './core'

/* The shared GET filter/search bar used by the Users hub, grading queue,
 * activity log and finance ledger. */

/** Standard control styling for a FilterBar input. Add `w-full` for a
 *  flexible search box. */
export const FILTER_CONTROL =
  'mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

/** Standard control styling for FilterBar select dropdowns with custom chevron. */
export const SELECT_CONTROL = cx(
  FILTER_CONTROL,
  'cursor-pointer appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20fill=%22none%22%20viewBox=%220%200%2020%2020%22%3E%3Cpath%20stroke=%22%2364748b%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20stroke-width=%221.5%22%20d=%22m6%208%204%204%204-4%22/%3E%3C/svg%3E")] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-8',
)

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
      <select className={cx(SELECT_CONTROL, selectClassName)} {...props}>
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

/** Shared month field for FilterBar layouts. */
export function MonthFilterField({
  label = 'Month',
  className = '',
  inputClassName = '',
  ...props
}: {
  label?: string
  className?: string
  inputClassName?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <FilterField label={label} className={className}>
      <input type="month" className={cx(FILTER_CONTROL, 'block', inputClassName)} {...props} />
    </FilterField>
  )
}

/** Shared year field for FilterBar layouts. Supports custom selectable years or a standard year number picker. */
export function YearFilterField({
  label = 'Year',
  name = 'year',
  className = '',
  inputClassName = '',
  years,
  defaultValue,
  ...props
}: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  years?: number[]
  defaultValue?: string | number
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  if (years && years.length > 0) {
    return (
      <FilterField label={label} className={className}>
        <select
          name={name}
          defaultValue={defaultValue != null ? String(defaultValue) : undefined}
          className={cx(SELECT_CONTROL, inputClassName)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </FilterField>
    )
  }
  return (
    <FilterField label={label} className={className}>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min="2000"
        max="2099"
        step="1"
        placeholder="YYYY"
        className={cx(FILTER_CONTROL, 'w-24', inputClassName)}
        {...props}
      />
    </FilterField>
  )
}

/** Shared date-range field (From - To) for FilterBar layouts. */
export function DateRangeFilterField({
  label = 'Date range',
  fromName = 'from',
  toName = 'to',
  fromLabel = 'From',
  toLabel = 'To',
  defaultFrom = '',
  defaultTo = '',
  className = '',
}: {
  label?: string
  fromName?: string
  toName?: string
  fromLabel?: string
  toLabel?: string
  defaultFrom?: string
  defaultTo?: string
  className?: string
}) {
  return (
    <div className={cx('flex flex-col', className)}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          name={fromName}
          defaultValue={defaultFrom}
          aria-label={fromLabel}
          title={fromLabel}
          className={cx(FILTER_CONTROL, 'max-w-[8.5rem] min-w-0')}
        />
        <span className="text-xs font-medium text-slate-600" aria-hidden="true">
          &ndash;
        </span>
        <input
          type="date"
          name={toName}
          defaultValue={defaultTo}
          aria-label={toLabel}
          title={toLabel}
          className={cx(FILTER_CONTROL, 'max-w-[8.5rem] min-w-0')}
        />
      </div>
    </div>
  )
}

/** Shared sort dropdown field with options array and unified select styling. */
export function SortFilterField({
  label = 'Sort by',
  name = 'sort',
  defaultValue,
  options,
  className = '',
  selectClassName = '',
  ...props
}: {
  label?: string
  name?: string
  defaultValue?: string
  options: Array<{ value: string; label: string }>
  className?: string
  selectClassName?: string
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>) {
  return (
    <FilterField label={label} className={className}>
      <select name={name} defaultValue={defaultValue} className={cx(SELECT_CONTROL, selectClassName)} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
  hidden = false,
  action,
  children,
}: {
  clearHref?: string
  showClear?: boolean
  applyLabel?: string
  className?: string
  /**
   * Render nothing at all. Pass `true` for "there is nothing to filter AND no filter is set":
   * there, Apply reloads the same empty screen, so the control looks broken rather than
   * pointless. Pass `false` as soon as a filter IS active, or a search matching nothing could
   * never be cleared.
   */
  hidden?: boolean
  /**
   * Optional custom submission target (e.g. `/students/123#hours`).
   * When omitted, submits to the current pathname.
   */
  action?: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  if (hidden) return null

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const sp = new URLSearchParams()
    for (const [key, val] of formData.entries()) {
      if (typeof val === 'string') {
        const trimmed = val.trim()
        if (trimmed !== '') {
          sp.append(key, trimmed)
        }
      }
    }

    let targetPath = pathname ?? ''
    let targetHash = typeof window !== 'undefined' ? window.location.hash : ''

    if (action) {
      if (action.startsWith('#')) {
        targetHash = action
      } else {
        try {
          const parsed = new URL(action, 'http://localhost')
          targetPath = parsed.pathname
          if (parsed.hash) {
            targetHash = parsed.hash
          }
        } catch {
          targetPath = action
        }
      }
    }

    const query = sp.toString()
    const destination = `${targetPath}${query ? `?${query}` : ''}${targetHash}`

    startTransition(() => {
      if (
        typeof window !== 'undefined' &&
        `${window.location.pathname}${window.location.search}${window.location.hash}` === destination
      ) {
        router.refresh()
      } else {
        router.push(destination, { scroll: false })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cx('flex flex-wrap items-end gap-2', className)}>
      {children}
      <button type="submit" disabled={isPending} className="btn btn-sm btn-soft">
        {applyLabel}
      </button>
      {showClear && clearHref && (
        <Link href={clearHref} scroll={false} className="text-xs font-medium text-slate-600 hover:text-primary">
          Clear
        </Link>
      )}
    </form>
  )
}
