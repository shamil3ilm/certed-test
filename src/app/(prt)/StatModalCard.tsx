'use client'
import { useState } from 'react'

type Item = { primary: string; secondary?: string }
type Section = { heading: string; total?: string; items: Item[] }

export function StatModalCard({
  label,
  value,
  sub,
  tone = 'default',
  title,
  items,
  sections,
  empty,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'primary'
  title: string
  items?: Item[]
  sections?: Section[]
  empty?: string
}) {
  const [open, setOpen] = useState(false)
  const groups: Section[] = sections ?? [{ heading: '', items: items ?? [] }]
  const count = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`group flex flex-col rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
          tone === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-white'
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">{sub ?? ' '}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            View details
            <svg className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {title} <span className="text-slate-400">({count})</span>
              </h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
            </div>

            {groups.map((g, gi) => (
              <div key={gi} className="mt-4 first:mt-3">
                {g.heading && (
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.heading}</span>
                    {g.total && <span className="text-sm font-semibold text-slate-700">{g.total}</span>}
                  </div>
                )}
                <ul className="mt-1 space-y-0.5">
                  {g.items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <span className="text-slate-700">{it.primary}</span>
                      {it.secondary && <span className="shrink-0 text-xs text-slate-400">{it.secondary}</span>}
                    </li>
                  ))}
                  {g.items.length === 0 && (
                    <li className="py-3 text-center text-sm text-slate-400">{empty ?? 'Nothing to show.'}</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
