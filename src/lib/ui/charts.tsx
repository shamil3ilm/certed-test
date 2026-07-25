/* Dependency-free chart primitives and their legend key. */

/** Coloured dot + label, e.g. a calendar/legend key. */
export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
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
          <span className="w-32 shrink-0 truncate text-slate-500" title={d.label}>
            {d.label}
          </span>
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
