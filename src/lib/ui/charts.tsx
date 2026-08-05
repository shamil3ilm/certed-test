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

export type ChartPoint = { label: string; value: number }
type Fmt = (n: number) => string

/** Dependency-free vertical column chart. Good for a few labelled categories or a
 *  short time series. Bars share one scale (max of the set). */
export function ColumnChart({ data, format }: { data: ChartPoint[]; format?: Fmt }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-44 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
          <span className="text-center text-[10px] tabular-nums text-slate-500">
            {format ? format(d.value) : d.value}
          </span>
          <div
            className="w-full rounded-t bg-gradient-to-t from-primary to-secondary"
            style={{ height: `${Math.max(2, Math.round((d.value / max) * 100))}%` }}
            title={`${d.label}: ${format ? format(d.value) : d.value}`}
          />
          <span className="w-full truncate text-center text-[10px] text-slate-400" title={d.label}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Dependency-free line chart (SVG). Best for a trend over time. */
export function LineChart({ data, format }: { data: ChartPoint[]; format?: Fmt }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>
  const values = data.map((d) => d.value)
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const W = 100
  const H = 40
  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * W : W / 2)
  const y = (v: number) => H - ((v - min) / span) * H
  const points = data.map((d, i) => `${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full text-primary" role="img">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => (
          <circle key={d.label} cx={x(i)} cy={y(d.value)} r="1.4" fill="currentColor" vectorEffect="non-scaling-stroke">
            <title>{`${d.label}: ${format ? format(d.value) : d.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
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
