import type { ReactNode } from 'react'

/** Consistent page title block used across all portal pages. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
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
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

/** Dependency-free horizontal bar chart. */
export function MiniBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-500" title={d.label}>{d.label}</span>
          <div className="h-3 flex-1 rounded-full bg-slate-100">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-primary to-secondary"
              style={{ width: `${Math.round((d.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right tabular-nums text-slate-600">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

/** A simple SVG donut for a two-part (done/remaining) ratio. */
export function Donut({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? value / total : 0
  const r = 32
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="42" cy="42" r={r} fill="none" stroke="var(--primary)" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" className="fill-slate-700 text-sm font-semibold">
          {value}/{total}
        </text>
      </svg>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}
