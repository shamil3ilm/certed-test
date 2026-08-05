import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import type { ChartPoint } from '@/lib/ui'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { myClassIds } from '@/lib/services/classes'
import { selectAllClassIds } from '@/lib/data/classes'
import { selectSessionsForClasses, selectAttendanceStatusesForClasses } from '@/lib/data/analytics'
import { summarizeAttendance, type AttendanceStatus } from '@/lib/attendance/summary'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { financeTotals } from '@/lib/services/finance/finance-docs'

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
    const [receipts, payslips, classIds] = await Promise.all([
      financeTotals('receipt'),
      financeTotals('payslip'),
      selectAllClassIds(),
    ])
    // Revenue vs payout in the most-used currency (usually one for the academy).
    const primary = [...receipts, ...payslips].sort((a, b) => b.live_total - a.live_total)[0]?.currency ?? 'INR'
    const rev = receipts.find((t) => t.currency === primary)?.live_total ?? 0
    const pay = payslips.find((t) => t.currency === primary)?.live_total ?? 0
    series.push({
      key: 'revenue',
      label: 'Revenue',
      unit: 'money',
      moneyPrefix: CURRENCY_PREFIX[primary] ?? `${primary} `,
      styles: ['column', 'bar'],
      data: [
        { label: 'Revenue', value: rev },
        { label: 'Payout', value: pay },
        { label: 'Net', value: rev - pay },
      ],
    })
    series.push(await weeklySessionsSeries(classIds))
    series.push({
      key: 'attendance',
      label: 'Attendance',
      unit: 'count',
      styles: ['column', 'bar'],
      data: attendanceMix(
        summarizeAttendance((await selectAttendanceStatusesForClasses(classIds)) as { status: AttendanceStatus }[]),
      ),
    })
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
