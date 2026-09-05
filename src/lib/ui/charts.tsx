/* Dependency-free chart primitives and their legend key. */
import { cx } from './core'

/** Coloured dot + label, e.g. a calendar/legend key. */
export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

export type ChartPoint = { label: string; value: number }
type Fmt = (n: number) => string

const fmt = (v: number, f?: Fmt) => (f ? f(v) : String(v))

function AxisTickLabels({ data, ticks }: { data: ChartPoint[]; ticks: Set<number> }) {
  return (
    <div
      className="mt-1 grid gap-2 text-meta text-slate-600"
      style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {data.map((point, index) => (
        <span
          key={`${point.label}-${index}`}
          className={cx(
            'min-w-0 truncate',
            index === 0 ? 'text-left' : index === data.length - 1 ? 'text-right' : 'text-center',
          )}
          title={ticks.has(index) ? point.label : undefined}
        >
          {ticks.has(index) ? point.label : '\u00a0'}
        </span>
      ))}
    </div>
  )
}

/**
 * Regularly-spaced indices for thinning a dense axis, always including the first
 * and last bucket. A date axis with many buckets would otherwise overlap or
 * truncate its labels; a short categorical axis (<= max) keeps every label.
 *
 * Uses a constant STEP rather than `round(k*(n-1)/(max-1))`: the rounding version
 * produced adjacent ticks in the MIDDLE whenever `(n-1)` wasn't a multiple of
 * `(max-1)` (e.g. n=8,max=5 -> 0,2,4,5,7, so two labels sat one bucket apart while
 * the rest were two apart). A constant step keeps every interior gap equal; only
 * the final label may sit closer, which reads naturally as "the latest point".
 */
export function tickIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil((n - 1) / (max - 1))
  const out = new Set<number>()
  for (let i = 0; i < n; i += step) out.add(i)
  out.add(n - 1) // always label the most recent bucket
  return [...out].sort((a, b) => a - b)
}

function NoData() {
  return <p className="text-sm text-slate-600">No data yet.</p>
}

/**
 * Dependency-free vertical column chart. Handles negatives with a zero baseline
 * (positive bars grow up, negative down), and keeps the value label as its own
 * row above a fixed-height plot so the tallest bar never overflows the box.
 */
export function ColumnChart({ data, format }: { data: ChartPoint[]; format?: Fmt }) {
  if (data.length === 0) return <NoData />
  const values = data.map((d) => d.value)
  const posMax = Math.max(0, ...values)
  const negMax = Math.max(0, ...values.map((v) => -v))
  const total = posMax + negMax || 1
  const zeroFromTop = (posMax / total) * 100 // where the value=0 line sits in the plot
  // Up to 8 buckets still reads cleanly at the current label size, and showing
  // every weekly bucket avoids misleading gaps like "13, 27, 3" when the hidden
  // intermediate weeks make an even cadence look irregular to the viewer.
  const labelAt = new Set(tickIndices(data.length, 8))

  return (
    <div role="img" aria-label={data.map((d) => `${d.label}: ${fmt(d.value, format)}`).join(', ')}>
      <div className="flex h-48 items-stretch gap-2">
        {data.map((d, i) => {
          const isNeg = d.value < 0
          const magPct = d.value === 0 ? 0 : Math.max(1.5, (Math.abs(d.value) / total) * 100)
          return (
            <div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-center text-meta tabular-nums text-slate-600">{fmt(d.value, format)}</span>
              <div className="relative flex-1">
                {negMax > 0 && (
                  <div
                    className="absolute inset-x-0 border-t border-dashed border-slate-200"
                    style={{ top: `${zeroFromTop}%` }}
                    aria-hidden
                  />
                )}
                <div
                  className={cx(
                    'absolute inset-x-0',
                    isNeg ? 'rounded-b-sm bg-rose-400/80' : 'rounded-t-sm bg-gradient-to-t from-primary to-secondary',
                  )}
                  style={
                    isNeg
                      ? { top: `${zeroFromTop}%`, height: `${magPct}%` }
                      : { bottom: `${100 - zeroFromTop}%`, height: `${magPct}%` }
                  }
                  title={`${d.label}: ${fmt(d.value, format)}`}
                />
              </div>
            </div>
          )
        })}
      </div>
      <AxisTickLabels data={data} ticks={labelAt} />
    </div>
  )
}

/**
 * Dependency-free line chart. The line is a stretched SVG (fills the width), but
 * the data-point markers are HTML dots positioned in screen space, so they stay
 * ROUND (an SVG circle in a non-uniformly scaled viewBox would draw as an ellipse).
 */
export function LineChart({ data, format }: { data: ChartPoint[]; format?: Fmt }) {
  if (data.length === 0) return <NoData />
  const values = data.map((d) => d.value)
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const px = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * 100 : 50)
  const py = (v: number) => (1 - (v - min) / span) * 100
  const points = data.map((d, i) => `${px(i).toFixed(2)},${py(d.value).toFixed(2)}`).join(' ')
  const ticks = tickIndices(data.length, 8)
  return (
    <div>
      <div
        className="relative h-44 w-full"
        role="img"
        aria-label={data.map((d) => `${d.label}: ${fmt(d.value, format)}`).join(', ')}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-primary">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white"
            style={{ left: `${px(i)}%`, top: `${py(d.value)}%` }}
            title={`${d.label}: ${fmt(d.value, format)}`}
          />
        ))}
      </div>
      <AxisTickLabels data={data} ticks={new Set(ticks)} />
    </div>
  )
}

/** Dependency-free horizontal bar chart. Scales on the max magnitude and shows the
 *  formatted value in an auto-sized column (a negative value reads as its label with
 *  an empty bar rather than a wrong-width one). */
export function MiniBars({ data, format }: { data: ChartPoint[]; format?: Fmt }) {
  if (data.length === 0) return <NoData />
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)))
  return (
    <div
      className="space-y-2"
      role="img"
      aria-label={data.map((d) => `${d.label}: ${fmt(d.value, format)}`).join(', ')}
    >
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600 sm:w-32" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 rounded-full bg-slate-100">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-primary to-secondary"
              style={{ width: `${Math.max(0, Math.round((d.value / max) * 100))}%` }}
            />
          </div>
          <span className="min-w-[3rem] shrink-0 whitespace-nowrap text-right tabular-nums text-slate-600">
            {fmt(d.value, format)}
          </span>
        </div>
      ))}
    </div>
  )
}
