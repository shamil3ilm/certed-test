'use client'

import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/ui'
import type { ActionResult } from '@/lib/api/action-error'
import { assertActionOk } from '../../action-client'
import { useUI } from '../../Providers'

type Party = { id: string; name: string }

const FIELD_CLASS = 'mt-1 block w-full rounded border px-2 py-2'
const MIN_CHARS = 2
const DEBOUNCE_MS = 250

/**
 * Single-select async typeahead for a finance party. Instead of shipping the
 * whole roster into a <select>, it queries `onSearch` (a gated server action) as
 * the user types. The parent owns the committed selection (`selectedName` +
 * onPick/onClear) so it can keep the id as its form value.
 */
export function AsyncPartyPicker({
  label,
  selectedName,
  onSearch,
  onPick,
  onClear,
}: {
  label: string
  selectedName: string
  onSearch: (query: string) => Promise<ActionResult<Party[]>>
  onPick: (party: Party) => void
  onClear: () => void
}) {
  const { toast } = useUI()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Party[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  // Refs so the debounced effect depends only on `query` - not on prop/handler
  // identity, which would otherwise restart the timer (and the search) every render.
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch
  const toastRef = useRef(toast)
  toastRef.current = toast
  // Monotonic request id: server actions aren't abortable, so a slow earlier
  // response must not overwrite a newer one.
  const reqId = useRef(0)

  useEffect(() => {
    const term = query.trim()
    if (term.length < MIN_CHARS) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const id = ++reqId.current
    const handle = setTimeout(async () => {
      try {
        const rows = (assertActionOk(await onSearchRef.current(term), 'Could not search students') ?? []) as Party[]
        if (reqId.current === id) setResults(rows)
      } catch (error) {
        if (reqId.current === id) {
          setResults([])
          toastRef.current(error instanceof Error ? error.message : 'Could not search students', 'error')
        }
      } finally {
        if (reqId.current === id) setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  function pick(party: Party) {
    onPick(party)
    setQuery('')
    setResults([])
    setOpen(false)
    reqId.current++
  }

  // A committed selection shows as a chip; "Change" clears it back to a search.
  if (selectedName) {
    return (
      <label className="min-w-0 text-sm">
        {label}
        <div className={cx(FIELD_CLASS, 'flex items-center justify-between gap-2')}>
          <span className="truncate">{selectedName}</span>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
              setResults([])
              setOpen(false)
              reqId.current++
            }}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Change
          </button>
        </div>
      </label>
    )
  }

  const showDropdown = open && query.trim().length >= MIN_CHARS

  return (
    <label className="relative min-w-0 text-sm">
      {label}
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          // Keep open only while focus stays inside this picker (e.g. Tab onto an
          // option button); close when focus leaves for a sibling field.
          if (!event.currentTarget.closest('label')?.contains(event.relatedTarget as Node | null)) {
            setOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          } else if (event.key === 'Enter') {
            // Don't submit the whole IssueForm from the search box; commit the top
            // match instead (or do nothing while results are still empty).
            event.preventDefault()
            if (results.length > 0) pick(results[0])
          }
        }}
        placeholder="Search by name or email..."
        className={FIELD_CLASS}
        role="combobox"
        aria-expanded={showDropdown}
        autoComplete="off"
      />
      {showDropdown && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {searching && <p className="px-3 py-2 text-xs text-slate-400">Searching...</p>}
          {!searching && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No students match that search.</p>
          )}
          {results.map((party) => (
            <button
              key={party.id}
              type="button"
              role="option"
              // preventDefault keeps focus on the input so the click commits before
              // any blur can tear the dropdown down.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(party)}
              className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              {party.name}
            </button>
          ))}
        </div>
      )}
    </label>
  )
}
