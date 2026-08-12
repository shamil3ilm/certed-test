import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { ChartPoint } from '@/lib/ui'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { myClassIds } from '@/lib/services/classes'
import { selectAllClassIds } from '@/lib/data/classes'
import { selectSessionsForClasses, selectAttendanceStatusesForClasses } from '@/lib/data/analytics'
import { summarizeAttendance, type AttendanceStatus } from '@/lib/attendance/summary'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { financeTotalsBase } from '@/lib/services/finance/finance-docs'

/**
 * Chart data for the dashboard's dynamic chart panel. Each persona gets a few
 * relevant metrics; the viewer picks which one to see and which style reads best
 * (client-side, see DashboardCharts). Data-only - no rendering here.
 */

export type ChartStyle = 'column' | 'line' | 'bar'
export type ChartPeriod = '4w' | '8w' | '3m' | '6m'
export type ChartGroupBy = 'week' | 'month'

export type ChartSeriesVariant = {
  period: ChartPeriod
  groupBy: ChartGroupBy
  data: ChartPoint[]
  note?: string
}

export type ChartSeries = {
  key: string
  label: string
  data: ChartPoint[]
  unit?: 'count' | 'hours' | 'money'
  styles?: ChartStyle[]
  moneyPrefix?: string
  /** A caveat shown under the chart, e.g. that some amounts are not yet converted
   *  into the base currency, so the figures understate. */
  note?: string
  variants?: ChartSeriesVariant[]
  defaultPeriod?: ChartPeriod
  defaultGroupBy?: ChartGroupBy
}

const CURRENCY_PREFIX: Record<string, string> = { INR: '\u20B9', USD: '$', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ' }

function startOfUtcMonth(year: number, monthIndex: number): number {
  return Date.UTC(year, monthIndex, 1)
}

/** Buckets ISO dates into the last `weeks` Monday-started weeks, newest last. */
function weeklySeries(dates: string[], weeks = 8): ChartPoint[] {
  const MS_DAY = 86_400_000
  const now = new Date()
  const isoDow = now.getUTCDay() === 0 ? 7 : now.getUTCDay() // Mon=1..Sun=7
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (isoDow - 1) * MS_DAY
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = thisMonday - (weeks - 1 - i) * 7 * MS_DAY
    return { start, end: start + 7 * MS_DAY, label: label.format(new Date(start)), value: 0 }
  })
  for (const d of dates) {
    const t = Date.parse(d)
    if (Number.isNaN(t)) continue
    const bucket = buckets.find((b) => t >= b.start && t < b.end)
    if (bucket) bucket.value += 1
  }
  return buckets.map((b) => ({ label: b.label, value: b.value }))
}

function monthlySeries(dates: string[], months = 6): ChartPoint[] {
  const now = new Date()
  const label = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
  const buckets = Array.from({ length: months }, (_, i) => {
    const monthOffset = months - 1 - i
    const start = startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth() - monthOffset)
    const end = startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth() - monthOffset + 1)
    return { start, end, label: label.format(new Date(start)), value: 0 }
  })
  for (const d of dates) {
    const t = Date.parse(d)
    if (Number.isNaN(t)) continue
    const bucket = buckets.find((b) => t >= b.start && t < b.end)
    if (bucket) bucket.value += 1
  }
  return buckets.map((b) => ({ label: b.label, value: b.value }))
}

function attendanceMix(summary: { present: number; late: number; absent: number }): ChartPoint[] {
  return [
    { label: 'Present', value: summary.present },
    { label: 'Late', value: summary.late },
    { label: 'Absent', value: summary.absent },
  ]
}

async function weeklySessionsSeries(classIds: string[]): Promise<ChartSeries> {
  const sessions = classIds.length ? await selectSessionsForClasses(classIds) : []
  const dates = sessions.map((s) => s.session_date)
  return {
    key: 'sessions',
    label: 'Sessions / week',
    unit: 'count',
    styles: ['column', 'line', 'bar'],
    data: weeklySeries(dates, 8),
    variants: [
      { period: '4w', groupBy: 'week', data: weeklySeries(dates, 4) },
      { period: '8w', groupBy: 'week', data: weeklySeries(dates, 8) },
      { period: '3m', groupBy: 'week', data: weeklySeries(dates, 13) },
      { period: '6m', groupBy: 'week', data: weeklySeries(dates, 26) },
      { period: '6m', groupBy: 'month', data: monthlySeries(dates, 6) },
    ],
    defaultPeriod: '8w',
    defaultGroupBy: 'week',
  }
}

export async function loadDashboardChartSeries(me: Profile): Promise<ChartSeries[]> {
  const flags = await loadPersonaFlags(me.id)
  const series: ChartSeries[] = []

  if (flags.isAdmin) {
    const [receiptBase, payslipBase, classIds] = await Promise.all([
      financeTotalsBase('receipt'),
      financeTotalsBase('payslip'),
      selectAllClassIds(),
    ])
    const base = receiptBase.base_currency || payslipBase.base_currency || 'INR'
    const rev = receiptBase.base_total
    const pay = payslipBase.base_total
    // If any document isn't yet priced into the base currency, the figures
    // understate - say so, same as the Net card, rather than implying a total.
    const unconverted = receiptBase.unconverted_count + payslipBase.unconverted_count
    // Net is the admin Net card's headline, so it is NOT repeated as a bar here -
    // the chart adds the revenue-vs-payout COMPARISON the card can only state as
    // text (both sum the same per-document base amounts, so they always agree).
    series.push({
      key: 'revenue',
      label: 'Revenue',
      unit: 'money',
      moneyPrefix: CURRENCY_PREFIX[base] ?? `${base} `,
      styles: ['column', 'bar'],
      data: [
        { label: 'Revenue', value: rev },
        { label: 'Payout', value: pay },
      ],
      note:
        unconverted > 0
          ? `${unconverted} document${unconverted === 1 ? '' : 's'} not yet converted to ${base} - add a rate to include ${unconverted === 1 ? 'it' : 'them'}.`
          : undefined,
    })
    series.push(await weeklySessionsSeries(classIds))
    // Admin dashboards should stay operational and cross-academy. Raw attendance
    // mix is more useful in class / mentor / student contexts than as a global
    // homepage metric for an admin.
    return series
  }

  const classIds = await myClassIds(me)
  series.push(await weeklySessionsSeries(classIds))
  const summary = flags.isStudent
    ? await summarizeAttendanceForStudent(me.id)
    : summarizeAttendance((await selectAttendanceStatusesForClasses(classIds)) as { status: AttendanceStatus }[])
  series.push({
    key: 'attendance',
    label: 'Attendance',
    unit: 'count',
    styles: ['column', 'bar'],
    data: attendanceMix(summary),
  })
  return series
}
