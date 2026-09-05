'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Modal } from './Modal'

type Item = { primary: string; secondary?: ReactNode; href?: string }
type Section = { heading: string; total?: string; items: Item[] }
type ModalData = { items?: Item[]; sections?: Section[] }

function sectionKey(section: Section, fallbackIndex: number): string {
  return section.heading || section.total || `section-${fallbackIndex}`
}

function itemKey(item: Item, fallbackIndex: number): string {
  return item.href || `${item.primary}-${fallbackIndex}`
}

export function StatModalCard({
  label,
  value,
  sub,
  tone = 'default',
  title,
  items,
  sections,
  empty,
  load,
  viewAllHref,
  viewAllLabel = 'View all',
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'primary'
  title: string
  items?: Item[]
  sections?: Section[]
  empty?: string
  /** Optional footer link to the full list page for this stat (e.g. the Mentees
   *  card links to /students), so the modal both drills into each row AND offers
   *  a jump to the whole list. */
  viewAllHref?: string
  viewAllLabel?: string
  /**
   * Fetch the modal's contents on first open instead of eagerly on page load
   * - for lists that can grow with the whole academy (all students, all
   * tutors, all classes). When provided, `items`/`sections` are ignored;
   * when omitted, `items`/`sections` are read directly from props every
   * render (so they stay in sync with a server re-render/revalidation,
   * unlike the fetch-once `load` path, which caches for the page's lifetime).
   */
  load?: () => Promise<ModalData>
}) {
  const [open, setOpen] = useState(false)
  const [loadedData, setLoadedData] = useState<ModalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const handleOpen = () => {
    setOpen(true)
    if (load && loadedData === null && !loading) {
      setLoading(true)
      setLoadError(false)
      load()
        .then(setLoadedData)
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false))
    }
  }

  const data: ModalData = load ? (loadedData ?? {}) : { items, sections }
  const groups: Section[] = data.sections ?? [{ heading: '', items: data.items ?? [] }]
  const count = groups.reduce((n, g) => n + g.items.length, 0)
  const isPending = !!load && loadedData === null
  const showLoading = isPending && loading
  const showError = isPending && !loading && loadError

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`group flex flex-col rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
          tone === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-white'
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
        <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
        {/* A long `sub` (e.g. the finance tile's "X in - Y out") wraps INSIDE its own
            column while "View details" sits beside it, so the two read as one interleaved
            string ("...Y View / out details"). Keep the link on one line and let the sub
            wrap in its own column: align to the top, let the sub shrink (min-w-0), and stop
            the link shrinking or wrapping. */}
        <div className="mt-2 flex items-start justify-between gap-2">
          <span className="min-w-0 text-xs text-slate-600">{sub ?? ' '}</span>
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-primary">
            View details
            <svg
              className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <>
            {title} {!isPending && <span className="text-slate-600">({count})</span>}
          </>
        }
      >
        {showLoading && <p className="py-6 text-center text-sm text-slate-600">Loading...</p>}
        {showError && <p className="py-6 text-center text-sm text-red-500">Couldn&apos;t load this - try again.</p>}
        {!isPending &&
          groups.map((g, gi) => (
            <div key={sectionKey(g, gi)} className="mt-4 first:mt-0">
              {g.heading && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{g.heading}</span>
                  {g.total && <span className="text-sm font-semibold text-slate-700">{g.total}</span>}
                </div>
              )}
              <ul className="mt-1 space-y-0.5">
                {g.items.map((it, i) => {
                  const row = (
                    <>
                      <span className="min-w-0 truncate text-slate-700">{it.primary}</span>
                      {it.secondary && <span className="shrink-0 text-xs text-slate-600">{it.secondary}</span>}
                    </>
                  )
                  return (
                    <li key={itemKey(it, i)}>
                      {it.href ? (
                        <Link
                          href={it.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                          {row}
                        </div>
                      )}
                    </li>
                  )
                })}
                {g.items.length === 0 && !g.total && (
                  <li className="py-3 text-center text-sm text-slate-600">{empty ?? 'Nothing to show.'}</li>
                )}
              </ul>
            </div>
          ))}
        {viewAllHref && (
          <div className="mt-4 border-t border-slate-100 pt-3 text-right">
            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {viewAllLabel}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        )}
      </Modal>
    </>
  )
}
