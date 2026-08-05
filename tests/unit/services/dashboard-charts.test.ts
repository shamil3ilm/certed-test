import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectAllClassIds: vi.fn() }))
vi.mock('@/lib/data/analytics', () => ({
  selectSessionsForClasses: vi.fn(),
  selectAttendanceStatusesForClasses: vi.fn(),
}))
vi.mock('@/lib/services/attendance', () => ({ summarizeAttendanceForStudent: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ financeTotals: vi.fn() }))

import { loadPersonaFlags } from '@/lib/permission/personas'
import { myClassIds } from '@/lib/services/classes'
import { selectAllClassIds } from '@/lib/data/classes'
import { selectSessionsForClasses, selectAttendanceStatusesForClasses } from '@/lib/data/analytics'
import { summarizeAttendanceForStudent } from '@/lib/services/attendance'
import { financeTotals } from '@/lib/services/finance/finance-docs'
import { loadDashboardChartSeries } from '@/lib/services/page-data/dashboard-charts'

const me = { id: 'u1' } as any
beforeEach(() => vi.resetAllMocks())

describe('loadDashboardChartSeries', () => {
  it('admin: revenue (net), weekly sessions (8 buckets), and attendance mix', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(financeTotals)
      .mockResolvedValueOnce([{ currency: 'INR', live_total: 1200 }] as any)
      .mockResolvedValueOnce([{ currency: 'INR', live_total: 400 }] as any)
    vi.mocked(selectAllClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectSessionsForClasses).mockResolvedValue([{ session_date: '2026-08-03' }] as any)
    vi.mocked(selectAttendanceStatusesForClasses).mockResolvedValue([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
    ] as any)

    const series = await loadDashboardChartSeries(me)
    expect(series.map((s) => s.key)).toEqual(['revenue', 'sessions', 'attendance'])

    const revenue = series[0]
    expect(revenue.unit).toBe('money')
    expect(revenue.moneyPrefix).toBe('₹')
    expect(revenue.data).toEqual([
      { label: 'Revenue', value: 1200 },
      { label: 'Payout', value: 400 },
      { label: 'Net', value: 800 },
    ])

    expect(series[1].data).toHaveLength(8) // 8 weekly buckets
    expect(series[2].data).toEqual([
      { label: 'Present', value: 2 },
      { label: 'Late', value: 1 },
      { label: 'Absent', value: 1 },
    ])
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
    expect(financeTotals).not.toHaveBeenCalled()
    expect(series[1].data).toEqual([
      { label: 'Present', value: 3 },
      { label: 'Late', value: 1 },
      { label: 'Absent', value: 1 },
    ])
  })
})
