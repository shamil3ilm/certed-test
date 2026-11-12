'use client'

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthLabel } from '@/lib/time/format'
import { cx } from './core'

/* The shared GET filter/search bar used by the Users hub, grading queue,
 * activity log and finance ledger. */

/** Standard control styling for a FilterBar input. Add `w-full` for a
 *  flexible search box. */
export const FILTER_CONTROL =
  'mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

/** Standard control styling for FilterBar select dropdowns with custom chevron. */
export const SELECT_CONTROL = cx(FILTER_CONTROL, 'select-control')

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

const MONTHS_GRID = [
  { num: '01', label: 'Jan' },
  { num: '02', label: 'Feb' },
  { num: '03', label: 'Mar' },
  { num: '04', label: 'Apr' },
  { num: '05', label: 'May' },
  { num: '06', label: 'Jun' },
  { num: '07', label: 'Jul' },
  { num: '08', label: 'Aug' },
  { num: '09', label: 'Sep' },
  { num: '10', label: 'Oct' },
  { num: '11', label: 'Nov' },
  { num: '12', label: 'Dec' },
] as const

/** Custom month picker field for FilterBar layouts.
 * Inspired by the clean year-and-month grid structure of native month inputs,
 * but fully redesigned with Cert-Ed design system tokens, bounded month tiles,
 * and intuitive year navigation.
 */
export function MonthFilterField({
  label = 'Month',
  name = 'month',
  className = '',
  inputClassName = '',
  defaultValue,
  autoSubmit = false,
}: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  defaultValue?: string
  autoSubmit?: boolean
}) {
  const initialValue =
    typeof defaultValue === 'string' && /^\d{4}-\d{2}$/.test(defaultValue)
      ? defaultValue
      : new Date().toISOString().slice(0, 7)

  const [prevDefault, setPrevDefault] = useState(defaultValue)
  const [selectedMonth, setSelectedMonth] = useState(initialValue)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [viewYear, setViewYear] = useState(() => {
    const y = parseInt(initialValue.slice(0, 4), 10)
    return Number.isNaN(y) ? new Date().getUTCFullYear() : y
  })

  // Synchronize state during render when defaultValue prop changes
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue)
    if (defaultValue && /^\d{4}-\d{2}$/.test(defaultValue)) {
      setSelectedMonth(defaultValue)
      const y = parseInt(defaultValue.slice(0, 4), 10)
      if (!Number.isNaN(y)) setViewYear(y)
    }
  }

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const currentMonthKey = new Date().toISOString().slice(0, 7)

  const handleSelectMonth = (monthKey: string) => {
    setSelectedMonth(monthKey)
    setOpen(false)
    if (autoSubmit && containerRef.current) {
      const form = containerRef.current.closest('form')
      if (form) {
        setTimeout(() => {
          form.requestSubmit()
        }, 0)
      }
    }
  }

  return (
    <div className={cx('relative inline-flex flex-col', className)} ref={containerRef}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input type="hidden" name={name} value={selectedMonth} />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label}: ${formatMonthLabel(selectedMonth) || selectedMonth}`}
        className={cx(
          FILTER_CONTROL,
          'flex min-w-[11.5rem] items-center justify-between gap-2.5 bg-white text-left font-medium text-slate-800 transition hover:border-slate-300 focus:border-primary',
          inputClassName,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">{formatMonthLabel(selectedMonth) || selectedMonth}</span>
        </span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select month"
          className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
        >
          {/* Year navigation header */}
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Previous year"
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-slate-800">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Next year"
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month grid with clear boundaries */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_GRID.map((m) => {
              const monthKey = `${viewYear}-${m.num}`
              const isSelected = selectedMonth === monthKey
              const isCurrent = currentMonthKey === monthKey
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => handleSelectMonth(monthKey)}
                  className={cx(
                    'rounded-lg border px-2 py-2 text-center text-xs transition cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary font-semibold text-white shadow-sm'
                      : isCurrent
                        ? 'border-primary/50 bg-primary/5 font-medium text-primary hover:bg-primary/10'
                        : 'border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* Quick actions footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const currentY = new Date().getUTCFullYear()
                setViewYear(currentY)
                handleSelectMonth(currentMonthKey)
              }}
              className="font-medium text-primary hover:underline cursor-pointer"
            >
              This month
            </button>
            <span className="font-mono text-meta tabular-nums text-slate-500">{selectedMonth}</span>
          </div>
        </div>
      )}
    </div>
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
