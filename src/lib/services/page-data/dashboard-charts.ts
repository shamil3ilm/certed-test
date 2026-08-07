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
}

const CURRENCY_PREFIX: Record<string, string> = { INR: '\u20B9', USD: '$', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ' }

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

function attendanceMix(summary: { present: number; late: number; absent: number }): ChartPoint[] {
  return [
    { label: 'Present', value: summary.present },
    { label: 'Late', value: summary.late },
    { label: 'Absent', value: summary.absent },
  ]
}

async function weeklySessionsSeries(classIds: string[]): Promise<ChartSeries> {
  const sessions = classIds.length ? await selectSessionsForClasses(classIds) : []
  return {
    key: 'sessions',
    label: 'Sessions / week',
    unit: 'count',
    styles: ['column', 'line', 'bar'],
    data: weeklySeries(sessions.map((s) => s.session_date)),
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
    // Revenue vs payout in the academy base currency, so the chart's Net always
    // agrees with the Net card (both sum the same per-document base amounts).
    const base = receiptBase.base_currency || payslipBase.base_currency || 'INR'
    const rev = receiptBase.base_total
    const pay = payslipBase.base_total
    // If any document isn't yet priced into the base currency, the figures
    // understate - say so, same as the Net card, rather than implying a total.
    const unconverted = receiptBase.unconverted_count + payslipBase.unconverted_count
    series.push({
      key: 'revenue',
      label: 'Revenue',
      unit: 'money',
      moneyPrefix: CURRENCY_PREFIX[base] ?? `${base} `,
      styles: ['column', 'bar'],
      data: [
        { label: 'Revenue', value: rev },
        { label: 'Payout', value: pay },
        { label: 'Net', value: rev - pay },
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
