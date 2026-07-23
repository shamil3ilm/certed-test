import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((amount: number, currency: string) => `${currency}:${amount}`),
  formatMoneyTotals: vi.fn((totals: { currency: string; live_total: number }[], fallback = 'INR') =>
    totals.length ? totals.map((t) => `${t.currency}:${t.live_total}`).join(' + ') : `${fallback}:0`,
  ),
}))
vi.mock('@/lib/time/format', () => ({ todayInDisplayZone: vi.fn(() => '2026-07-16') }))
vi.mock('@/lib/services/calendar-events', () => ({ listEvents: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ countActiveClasses: vi.fn(), listClasses: vi.fn() }))
vi.mock('@/lib/services/enrollments', () => ({ countEnrollmentsPerClass: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ financeTotals: vi.fn() }))
vi.mock('@/lib/services/reminders', () => ({ listMyPastReminders: vi.fn(), listMyReminders: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ countPeople: vi.fn(), getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))

import { listEvents } from '@/lib/services/calendar-events'
import { countActiveClasses, listClasses } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals } from '@/lib/services/finance/finance-docs'
import { listMyPastReminders, listMyReminders } from '@/lib/services/reminders'
import { countPeople, getProfileNamesByIds } from '@/lib/services/users'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { loadDashboardViewData, loadDashboardMentees } from '@/lib/services/page-data/dashboard'

beforeEach(() => vi.resetAllMocks())

// The dashboard's view kind is the actor's fixed identity (profiles.role), not a
// resolved-capability decision - so the tests drive it by `role`.
describe('loadDashboardViewData', () => {
  it('loads and shapes the admin dashboard view model', async () => {
    vi.mocked(listEvents).mockResolvedValueOnce([
      { id: 'e1', title: 'Exam', event_date: '2026-07-16', kind: 'exam' },
    ] as any)
    vi.mocked(listMyReminders).mockResolvedValueOnce([{ id: 'r1' }] as any)
    vi.mocked(listMyPastReminders).mockResolvedValueOnce([{ id: 'r2' }] as any)
    vi.mocked(countPeople).mockResolvedValueOnce({ students: 10, tutors: 2, pending: 1 } as any)
    vi.mocked(countActiveClasses).mockResolvedValueOnce(3 as any)
    vi.mocked(listClasses).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c2', name: 'Science', status: 'archived' },
      { id: 'c3', name: 'English', status: 'active' },
    ] as any)
    vi.mocked(countEnrollmentsPerClass).mockResolvedValueOnce(
      new Map([
        ['c1', 22],
        ['c3', 17],
      ]) as any,
    )
    vi.mocked(financeTotals)
      .mockResolvedValueOnce([{ live_total: 1200, currency: 'INR' }] as any)
      .mockResolvedValueOnce([{ live_total: 400, currency: 'INR' }] as any)

    await expect(loadDashboardViewData({ id: 'admin-1', role: 'admin' } as any)).resolves.toEqual({
      kind: 'admin',
      upcoming: [{ id: 'e1', title: 'Exam', event_date: '2026-07-16', kind: 'exam' }],
      reminders: [{ id: 'r1' }],
      pastReminders: [{ id: 'r2' }],
      peopleCounts: { students: 10, tutors: 2, pending: 1 },
      activeClassCount: 3,
      perClass: [
        { label: 'Math', value: 22 },
        { label: 'English', value: 17 },
      ],
      revenueLabel: 'INR:1200',
      payoutLabel: 'INR:400',
    })
  })

  it('loads the sub-admin dashboard counts only', async () => {
    vi.mocked(countPeople).mockResolvedValueOnce({ students: 9, tutors: 4, pending: 2 } as any)

    await expect(loadDashboardViewData({ id: 'sub-1', role: 'sub_admin' } as any)).resolves.toEqual({
      kind: 'sub_admin',
      students: 9,
      tutors: 4,
      pending: 2,
    })
    expect(listEvents).not.toHaveBeenCalled()
  })

  it('returns the tutor view kind for a tutor with no mentees, without admin aggregates', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce([]) // no mentees -> stays 'tutor'

    await expect(loadDashboardViewData({ id: 'tutor-1', role: 'tutor' } as any)).resolves.toEqual({ kind: 'tutor' })
    expect(countPeople).not.toHaveBeenCalled()
  })

  it('refines a tutor WITH mentees to the mentor view kind (mentees + teaching)', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1'])
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map([['s-1', 'Sara']]))

    await expect(loadDashboardViewData({ id: 'mentor-1', role: 'tutor' } as any)).resolves.toEqual({
      kind: 'mentor',
      mentees: [{ id: 's-1', name: 'Sara' }],
      teaches: true, // a tutor who mentors keeps the teaching widgets
    })
  })

  it('resolves a DEDICATED mentor account to the mentor view without teaching widgets', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1', 's-2'])
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', 'Sara'],
        ['s-2', 'Sam'],
      ]),
    )

    await expect(loadDashboardViewData({ id: 'maya-mentor', role: 'mentor' } as any)).resolves.toEqual({
      kind: 'mentor',
      mentees: [
        { id: 's-1', name: 'Sara' },
        { id: 's-2', name: 'Sam' },
      ],
      teaches: false, // a dedicated mentor teaches nothing
    })
  })

  it('falls back to the student view kind', async () => {
    await expect(loadDashboardViewData({ id: 'student-1', role: 'student' } as any)).resolves.toEqual({
      kind: 'student',
    })
  })
})

describe('loadDashboardMentees', () => {
  it('returns empty and skips the name lookup when the actor mentors nobody', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce([])
    await expect(loadDashboardMentees({ id: 'tutor-1' } as any)).resolves.toEqual([])
    expect(getProfileNamesByIds).not.toHaveBeenCalled()
  })

  it('resolves the actor own mentees to id + name, preserving order', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1', 's-2'])
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', 'Sara'],
        ['s-2', 'Sam'],
      ]),
    )
    await expect(loadDashboardMentees({ id: 'mentor-1' } as any)).resolves.toEqual([
      { id: 's-1', name: 'Sara' },
      { id: 's-2', name: 'Sam' },
    ])
  })
})
