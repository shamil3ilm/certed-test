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
import { formatMonthLabel, formatDate } from '@/lib/time/format'
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

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Custom date picker field for FilterBar layouts.
 * Features a bounded day grid, month/decade roll-up navigation,
 * and intuitive fast shortcuts ("Today", "Clear").
 */
export function DateFilterField({
  label = 'Date',
  name = 'date',
  className = '',
  inputClassName = '',
  defaultValue = '',
  placeholder,
  autoSubmit = false,
}: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  defaultValue?: string
  placeholder?: string
  autoSubmit?: boolean
}) {
  const initialValue = typeof defaultValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(defaultValue) ? defaultValue : ''

  const [selectedDate, setSelectedDate] = useState<string>(initialValue)
  const [prevDefault, setPrevDefault] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days')
  const containerRef = useRef<HTMLDivElement>(null)

  const initialDateObj = initialValue ? new Date(`${initialValue}T00:00:00Z`) : new Date()
  const [viewYear, setViewYear] = useState(() => initialDateObj.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(() => initialDateObj.getUTCMonth())

  // Synchronize state during render when defaultValue prop changes
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue)
    if (typeof defaultValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(defaultValue)) {
      setSelectedDate(defaultValue)
      const d = new Date(`${defaultValue}T00:00:00Z`)
      if (!Number.isNaN(d.getTime())) {
        setViewYear(d.getUTCFullYear())
        setViewMonth(d.getUTCMonth())
      }
    } else if (!defaultValue) {
      setSelectedDate('')
    }
  }

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setViewMode('days')
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setViewMode('days')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const todayKey = new Date().toISOString().slice(0, 10)

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey)
    setOpen(false)
    setViewMode('days')
    if (autoSubmit && containerRef.current) {
      const form = containerRef.current.closest('form')
      if (form) {
        setTimeout(() => {
          form.requestSubmit()
        }, 0)
      }
    }
  }

  // Days calculations
  const pad = (n: number) => String(n).padStart(2, '0')
  const firstDayOfWeek = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate()
  const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate()

  const calendarDays: Array<{
    dateKey: string
    dayNum: number
    isCurrentMonth: boolean
    isToday: boolean
    isSelected: boolean
  }> = []

  // Leading days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear
    const dateKey = `${prevY}-${pad(prevM + 1)}-${pad(d)}`
    calendarDays.push({
      dateKey,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDate,
    })
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`
    calendarDays.push({
      dateKey,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDate,
    })
  }

  // Trailing days
  const totalCells = calendarDays.length <= 35 ? 35 : 42
  const trailingCount = totalCells - calendarDays.length
  for (let d = 1; d <= trailingCount; d++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
    const dateKey = `${nextY}-${pad(nextM + 1)}-${pad(d)}`
    calendarDays.push({
      dateKey,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDate,
    })
  }

  const decadeStart = Math.floor(viewYear / 10) * 10
  const decadeYears = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i)

  const formattedDisplay = selectedDate ? formatDate(`${selectedDate}T00:00:00Z`, 'UTC') || selectedDate : ''

  return (
    <div className={cx('relative inline-flex flex-col', className)} ref={containerRef}>
      {label && <span className="text-xs font-medium text-slate-600">{label}</span>}
      <input type="hidden" name={name} value={selectedDate} />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label ? `${label}: ${formattedDisplay || 'Select date'}` : formattedDisplay || 'Select date'}
        className={cx(
          FILTER_CONTROL,
          'flex min-w-[9.5rem] items-center justify-between gap-2 bg-white text-left font-medium text-slate-800 transition hover:border-slate-300 focus:border-primary',
          inputClassName,
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className={cx('truncate', !selectedDate && 'font-normal text-slate-500')}>
            {formattedDisplay || placeholder || 'Select date'}
          </span>
        </span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date"
          className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
        >
          {/* Header */}
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'days') {
                  if (viewMonth === 0) {
                    setViewMonth(11)
                    setViewYear((y) => y - 1)
                  } else {
                    setViewMonth((m) => m - 1)
                  }
                } else if (viewMode === 'months') {
                  setViewYear((y) => y - 1)
                } else {
                  setViewYear((y) => y - 10)
                }
              }}
              aria-label="Previous"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Drill-Up Center Button */}
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'days') setViewMode('months')
                else if (viewMode === 'months') setViewMode('years')
                else setViewMode('days')
              }}
              aria-label="Switch view level"
              className="cursor-pointer rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              {viewMode === 'days' && `${MONTH_NAMES[viewMonth]} ${viewYear}`}
              {viewMode === 'months' && `${viewYear}`}
              {viewMode === 'years' && `${decadeStart} – ${decadeStart + 9}`}
            </button>

            <button
              type="button"
              onClick={() => {
                if (viewMode === 'days') {
                  if (viewMonth === 11) {
                    setViewMonth(0)
                    setViewYear((y) => y + 1)
                  } else {
                    setViewMonth((m) => m + 1)
                  }
                } else if (viewMode === 'months') {
                  setViewYear((y) => y + 1)
                } else {
                  setViewYear((y) => y + 10)
                }
              }}
              aria-label="Next"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Days View */}
          {viewMode === 'days' && (
            <div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center">
                {DAYS_OF_WEEK.map((d) => (
                  <span key={d} className="text-micro font-semibold uppercase tracking-wider text-slate-500">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((c) => (
                  <button
                    key={c.dateKey}
                    type="button"
                    onClick={() => handleSelectDate(c.dateKey)}
                    className={cx(
                      'mx-auto grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-xs transition',
                      c.isSelected
                        ? 'border border-primary bg-primary font-semibold text-white shadow-sm'
                        : c.isToday
                          ? 'border border-primary/50 bg-primary/5 font-semibold text-primary hover:bg-primary/10'
                          : c.isCurrentMonth
                            ? 'border border-transparent bg-white text-slate-800 hover:border-slate-200 hover:bg-slate-100'
                            : 'border border-transparent text-slate-500 opacity-60 hover:bg-slate-100',
                    )}
                  >
                    {c.dayNum}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Months View (Drill-Down / Drill-Up) */}
          {viewMode === 'months' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MONTH_NAMES.map((mName, idx) => {
                const isSelected = viewMonth === idx
                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx)
                      setViewMode('days')
                    }}
                    className={cx(
                      'cursor-pointer rounded-lg border px-2 py-2 text-center text-xs transition',
                      isSelected
                        ? 'border-primary bg-primary font-semibold text-white shadow-sm'
                        : 'border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {mName.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          )}

          {/* Years View (Decade Drill-Down) */}
          {viewMode === 'years' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {decadeYears.map((yr) => {
                const isSelected = viewYear === yr
                const inDecade = yr >= decadeStart && yr <= decadeStart + 9
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setViewYear(yr)
                      setViewMode('months')
                    }}
                    className={cx(
                      'cursor-pointer rounded-lg border px-2 py-2 text-center text-xs transition',
                      isSelected
                        ? 'border-primary bg-primary font-semibold text-white shadow-sm'
                        : inDecade
                          ? 'border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100',
                    )}
                  >
                    {yr}
                  </button>
                )
              })}
            </div>
          )}

          {/* Footer with Today / Clear */}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectDate(todayKey)}
                className="cursor-pointer font-medium text-primary hover:underline"
              >
                Today
              </button>
              {selectedDate && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    &bull;
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectDate('')}
                    className="cursor-pointer font-medium text-slate-500 hover:text-slate-800 hover:underline"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
            <span className="font-mono text-meta tabular-nums text-slate-500">{selectedDate || 'none'}</span>
          </div>
        </div>
      )}
    </div>
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

function YearSelectFilterField({
  label = 'Year',
  name = 'year',
  className = '',
  inputClassName = '',
  years,
  defaultValue,
}: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  years: number[]
  defaultValue?: string | number
}) {
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

function YearPickerFilterField({
  label = 'Year',
  name = 'year',
  className = '',
  inputClassName = '',
  defaultValue,
  autoSubmit = false,
}: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  defaultValue?: string | number
  autoSubmit?: boolean
}) {
  const initialYear = (() => {
    if (defaultValue != null) {
      const parsed = parseInt(String(defaultValue), 10)
      if (!Number.isNaN(parsed)) return parsed
    }
    return new Date().getUTCFullYear()
  })()

  const [selectedYear, setSelectedYear] = useState<number>(initialYear)
  const [prevDefault, setPrevDefault] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [decadeStart, setDecadeStart] = useState(() => Math.floor(initialYear / 10) * 10)
  const containerRef = useRef<HTMLDivElement>(null)

  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue)
    if (defaultValue != null) {
      const parsed = parseInt(String(defaultValue), 10)
      if (!Number.isNaN(parsed)) {
        setSelectedYear(parsed)
        setDecadeStart(Math.floor(parsed / 10) * 10)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSelectYear = (yr: number) => {
    setSelectedYear(yr)
    setOpen(false)
    if (autoSubmit && containerRef.current) {
      const form = containerRef.current.closest('form')
      if (form) setTimeout(() => form.requestSubmit(), 0)
    }
  }

  const currentYear = new Date().getUTCFullYear()
  const decadeYears = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i)

  return (
    <div className={cx('relative inline-flex flex-col', className)} ref={containerRef}>
      {label && <span className="text-xs font-medium text-slate-600">{label}</span>}
      <input type="hidden" name={name} value={selectedYear} />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label ? `${label}: ${selectedYear}` : String(selectedYear)}
        className={cx(
          FILTER_CONTROL,
          'flex min-w-[7.5rem] items-center justify-between gap-2.5 bg-white text-left font-medium text-slate-800 transition hover:border-slate-300 focus:border-primary',
          inputClassName,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate tabular-nums">{selectedYear}</span>
        </span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select year"
          className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
        >
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setDecadeStart((d) => d - 10)}
              aria-label="Previous decade"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-slate-800">
              {decadeStart} – {decadeStart + 9}
            </span>
            <button
              type="button"
              onClick={() => setDecadeStart((d) => d + 10)}
              aria-label="Next decade"
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {decadeYears.map((yr) => {
              const isSelected = selectedYear === yr
              const isCurrent = currentYear === yr
              const inDecade = yr >= decadeStart && yr <= decadeStart + 9
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => handleSelectYear(yr)}
                  className={cx(
                    'cursor-pointer rounded-lg border px-2 py-2 text-center text-xs tabular-nums transition',
                    isSelected
                      ? 'border-primary bg-primary font-semibold text-white shadow-sm'
                      : isCurrent
                        ? 'border-primary/50 bg-primary/5 font-medium text-primary hover:bg-primary/10'
                        : inDecade
                          ? 'border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100',
                  )}
                >
                  {yr}
                </button>
              )
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setDecadeStart(Math.floor(currentYear / 10) * 10)
                handleSelectYear(currentYear)
              }}
              className="cursor-pointer font-medium text-primary hover:underline"
            >
              This year
            </button>
            <span className="font-mono text-meta tabular-nums text-slate-500">{selectedYear}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Shared year field for FilterBar layouts. Supports custom selectable years or a bounded decade picker popover. */
export function YearFilterField(props: {
  label?: string
  name?: string
  className?: string
  inputClassName?: string
  years?: number[]
  defaultValue?: string | number
  autoSubmit?: boolean
}) {
  if (props.years && props.years.length > 0) {
    return <YearSelectFilterField {...props} years={props.years} />
  }
  return <YearPickerFilterField {...props} />
}

/** Shared date-range field (From - To) for FilterBar layouts with custom pickers. */
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
        <DateFilterField
          label=""
          name={fromName}
          defaultValue={defaultFrom}
          placeholder={fromLabel}
          className="min-w-0"
        />
        <span className="self-center text-xs font-medium text-slate-600" aria-hidden="true">
          &ndash;
        </span>
        <DateFilterField label="" name={toName} defaultValue={defaultTo} placeholder={toLabel} className="min-w-0" />
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
