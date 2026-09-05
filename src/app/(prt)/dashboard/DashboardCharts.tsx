'use client'

import { useState } from 'react'
import { ColumnChart, LineChart, MiniBars, Panel, cx } from '@/lib/ui'
import { formatMoney } from '@/lib/money'
import type {
  ChartGroupBy,
  ChartPeriod,
  ChartSeries,
  ChartSeriesVariant,
  ChartStyle,
} from '@/lib/services/page-data/dashboard-charts'

const STYLE_LABEL: Record<ChartStyle, string> = { column: 'Columns', line: 'Line', bar: 'Bars' }
const PERIOD_LABEL: Record<ChartPeriod, string> = {
  '4w': '4w',
  '8w': '8w',
  '3m': '3m',
  '6m': '6m',
}
const GROUP_BY_LABEL: Record<ChartGroupBy, string> = { week: 'Week', month: 'Month' }

function formatterFor(series: ChartSeries): ((n: number) => string) | undefined {
  if (series.unit === 'hours') return (n) => `${(n / 60).toFixed(1)}h`
  // formatMoney, not a prefix + bare toLocaleString: the latter grouped by the VIEWER'S
  // browser locale (a de-DE browser rendered 100000 as "100.000", which reads as one
  // hundred), dropped INR lakh/crore grouping, and had no entry for the 3-decimal Gulf
  // currencies. This formatter also feeds the chart's aria-label and title.
  if (series.unit === 'money') return (n) => (series.currency ? formatMoney(n, series.currency) : String(n))
  return undefined
}

function periodOptions(series: ChartSeries): ChartPeriod[] {
  return [...new Set((series.variants ?? []).map((variant) => variant.period))]
}

function groupByOptions(series: ChartSeries, period: ChartPeriod): ChartGroupBy[] {
  return [
    ...new Set(
      (series.variants ?? []).filter((variant) => variant.period === period).map((variant) => variant.groupBy),
    ),
  ]
}

function activeVariant(
  series: ChartSeries,
  period: ChartPeriod | undefined,
  groupBy: ChartGroupBy | undefined,
): ChartSeriesVariant | undefined {
  return series.variants?.find((variant) => variant.period === period && variant.groupBy === groupBy)
}

/**
 * Dynamic dashboard charts: the viewer picks WHICH metric to see and WHICH chart
 * style reads easiest for them (columns / line / bars). Time-series metrics can
 * also switch period (4w / 8w / 3m / 6m) and, for longer ranges, week vs month.
 * All rendering is
 * dependency-free (see @/lib/ui charts), so this adds no bundle weight.
 */
export function DashboardCharts({ series, title = 'Charts' }: { series: ChartSeries[]; title?: string }) {
  const [key, setKey] = useState(series[0]?.key)
  const active = series.find((s) => s.key === key) ?? series[0]
  const offered = active?.styles ?? ['column', 'line', 'bar']
  const [style, setStyle] = useState<ChartStyle>(offered[0] ?? 'column')
  const availablePeriods = active ? periodOptions(active) : []
  const [period, setPeriod] = useState<ChartPeriod | undefined>(availablePeriods[0])
  const effectivePeriod = availablePeriods.includes(period as ChartPeriod)
    ? (period as ChartPeriod)
    : (active?.defaultPeriod ?? availablePeriods[0])
  const availableGroupBy = active && effectivePeriod ? groupByOptions(active, effectivePeriod) : []
  const [groupBy, setGroupBy] = useState<ChartGroupBy | undefined>(availableGroupBy[0])
  const effectiveGroupBy = availableGroupBy.includes(groupBy as ChartGroupBy)
    ? (groupBy as ChartGroupBy)
    : (active?.defaultGroupBy ?? availableGroupBy[0])
  if (!active) return null

  // Keep the chosen style valid when switching to a metric that doesn't offer it.
  const effectiveStyle = offered.includes(style) ? style : (offered[0] ?? 'column')
  const format = formatterFor(active)
  const variant = activeVariant(active, effectivePeriod, effectiveGroupBy)
  const chartData = variant?.data ?? active.data
  const chartNote = variant?.note ?? active.note

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
        {availablePeriods.length > 0 && (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {availablePeriods.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                aria-pressed={option === effectivePeriod}
                className={cx(
                  'min-h-8 rounded-md px-2.5 text-xs font-medium transition',
                  option === effectivePeriod
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-700',
                )}
              >
                {PERIOD_LABEL[option]}
              </button>
            ))}
          </div>
        )}
        {availableGroupBy.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {availableGroupBy.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGroupBy(option)}
                aria-pressed={option === effectiveGroupBy}
                className={cx(
                  'min-h-8 rounded-md px-2.5 text-xs font-medium transition',
                  option === effectiveGroupBy
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-700',
                )}
              >
                {GROUP_BY_LABEL[option]}
              </button>
            ))}
          </div>
        )}
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
                  t === effectiveStyle ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-700',
                )}
              >
                {STYLE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">No data for this metric yet.</p>
        ) : effectiveStyle === 'column' ? (
          <ColumnChart data={chartData} format={format} />
        ) : effectiveStyle === 'line' ? (
          <LineChart data={chartData} format={format} />
        ) : (
          <MiniBars data={chartData} format={format} />
        )}
        {chartNote && <p className="mt-2 text-xs text-amber-600">{chartNote}</p>}
      </div>
    </Panel>
  )
}
