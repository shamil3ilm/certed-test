import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectAllClassIds: vi.fn() }))
vi.mock('@/lib/data/analytics', () => ({
  selectSessionsForClasses: vi.fn(),
  selectAttendanceStatusesForClasses: vi.fn(),
}))
vi.mock('@/lib/services/attendance', () => ({ summarizeAttendanceForStudent: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ financeTotalsBase: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ actorHasCapability: vi.fn() }))

import { selectSessionsForClasses, selectAttendanceStatusesForClasses } from '@/lib/data/analytics'
import { selectAllClassIds } from '@/lib/data/classes'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { myClassIds } from '@/lib/services/classes'
import { financeTotalsBase } from '@/lib/services/finance/finance-docs'
import { actorHasCapability } from '@/lib/services/authorization'
import { loadDashboardChartSeries } from '@/lib/services/page-data/dashboard-charts'

const me = { id: 'u1' } as any

beforeEach(() => {
  vi.resetAllMocks()
  // Default: the admin holds viewFinance. The deny case is asserted explicitly below.
  vi.mocked(actorHasCapability).mockResolvedValue(true)
})

describe('loadDashboardChartSeries', () => {
  it('admin: revenue vs payout (no Net bar - the Net card owns it) and weekly sessions (8 buckets)', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(financeTotalsBase)
      .mockResolvedValueOnce({
        base_currency: 'INR',
        base_total: 1200,
        converted_count: 1,
        unconverted_count: 0,
      } as any)
      .mockResolvedValueOnce({ base_currency: 'INR', base_total: 400, converted_count: 1, unconverted_count: 0 } as any)
    vi.mocked(selectAllClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectSessionsForClasses).mockResolvedValue([{ session_date: '2026-08-03' }] as any)
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValue([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
    ] as any)

    const series = await loadDashboardChartSeries(me)
    expect(series.map((s) => s.key)).toEqual(['revenue', 'sessions'])

    const revenue = series[0]
    expect(revenue.unit).toBe('money')
    // The series carries the CURRENCY CODE; the client renders it with formatMoney, which
    // owns the grouping locale and the minor units (a hardcoded symbol map had neither).
    expect(revenue.currency).toBe('INR')
    // Net is the Net card's headline, so it is not repeated as a bar - only the
    // revenue-vs-payout comparison the card can't show.
    expect(revenue.data).toEqual([
      { label: 'Revenue', value: 1200 },
      { label: 'Payout', value: 400 },
    ])

    expect(series[1].data).toHaveLength(8)
    // Everything converted -> no caveat.
    expect(revenue.note).toBeUndefined()
  })

  it('flags the revenue chart when some documents are not yet converted to base', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(financeTotalsBase)
      .mockResolvedValueOnce({
        base_currency: 'INR',
        base_total: 1200,
        converted_count: 1,
        unconverted_count: 2,
      } as any)
      .mockResolvedValueOnce({ base_currency: 'INR', base_total: 0, converted_count: 0, unconverted_count: 1 } as any)
    vi.mocked(selectAllClassIds).mockResolvedValue([])
    vi.mocked(selectSessionsForClasses).mockResolvedValue([] as any)

    const series = await loadDashboardChartSeries(me)
    const revenue = series[0]
    // 2 receipts + 1 pay slip still unpriced -> the chart says so, like the Net card.
    expect(revenue.note).toBe('3 documents not yet converted to INR - add a rate to include them.')
  })

  it('student: weekly sessions + their own attendance mix, no revenue', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isStudent: true } as any)
    vi.mocked(myClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectSessionsForClasses).mockResolvedValue([] as any)
    vi.mocked(summarizeAttendanceForStudent).mockResolvedValue({
      present: 3,
      late: 1,
      absent: 1,
      total: 5,
      rate: 80,
    })

    const series = await loadDashboardChartSeries(me)
    expect(series.map((s) => s.key)).toEqual(['sessions', 'attendance'])
    expect(financeTotalsBase).not.toHaveBeenCalled()
    expect(series[1].data).toEqual([
      { label: 'Present', value: 3 },
      { label: 'Late', value: 1 },
      { label: 'Absent', value: 1 },
    ])
  })
})

describe('loadDashboardChartSeries - viewFinance is a capability, not a persona', () => {
  it('omits the money series when viewFinance is DENIED, but keeps the operational one', async () => {
    // A deny override on viewFinance is an audited, reason-required act whose whole point
    // is removing finance visibility. This chart used to gate on the admin persona alone,
    // so a denied admin still saw academy revenue and payout here while /admin/finance and
    // the dashboard money cards correctly hid them.
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(actorHasCapability).mockResolvedValue(false)
    vi.mocked(selectAllClassIds).mockResolvedValue(['c1'] as any)
    vi.mocked(selectSessionsForClasses).mockResolvedValue([] as any)

    const series = await loadDashboardChartSeries(me)

    expect(series.map((s) => s.key)).toEqual(['sessions'])
    expect(financeTotalsBase).not.toHaveBeenCalled()
  })
})
