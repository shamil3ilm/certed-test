'use client'

import { useState } from 'react'
import { ColumnChart, LineChart, MiniBars, Panel, cx } from '@/lib/ui'
import type { ChartSeries, ChartStyle } from '@/lib/services/page-data/dashboard-charts'

const STYLE_LABEL: Record<ChartStyle, string> = { column: 'Columns', line: 'Line', bar: 'Bars' }

function formatterFor(series: ChartSeries): ((n: number) => string) | undefined {
  if (series.unit === 'hours') return (n) => `${(n / 60).toFixed(1)}h`
  if (series.unit === 'money') return (n) => `${series.moneyPrefix ?? ''}${n.toLocaleString()}`
  return undefined
}

/**
 * Dynamic dashboard charts: the viewer picks WHICH metric to see and WHICH chart
 * style reads easiest for them (columns / line / bars). All rendering is
 * dependency-free (see @/lib/ui charts), so this adds no bundle weight.
 */
export function DashboardCharts({ series, title = 'Charts' }: { series: ChartSeries[]; title?: string }) {
  const [key, setKey] = useState(series[0]?.key)
  const active = series.find((s) => s.key === key) ?? series[0]
  const offered = active?.styles ?? ['column', 'line', 'bar']
  const [style, setStyle] = useState<ChartStyle>(offered[0] ?? 'column')
  if (!active) return null

  // Keep the chosen style valid when switching to a metric that doesn't offer it.
  const effectiveStyle = offered.includes(style) ? style : (offered[0] ?? 'column')
  const format = formatterFor(active)

  return (
    <Panel title={title}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Metric picker */}
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setKey(s.key)}
              aria-pressed={s.key === active.key}
              className={cx(
                'min-h-8 rounded-full px-3 text-xs font-medium transition',
                s.key === active.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Chart-style picker, pushed to the right */}
        {offered.length > 1 && (
          <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {offered.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStyle(t)}
                aria-pressed={t === effectiveStyle}
                className={cx(
                  'min-h-8 rounded-md px-2.5 text-xs font-medium transition',
                  t === effectiveStyle ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {STYLE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        {active.data.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No data for this metric yet.</p>
        ) : effectiveStyle === 'column' ? (
          <ColumnChart data={active.data} format={format} />
        ) : effectiveStyle === 'line' ? (
          <LineChart data={active.data} format={format} />
        ) : (
          <MiniBars data={active.data} />
        )}
      </div>
    </Panel>
  )
}
