import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Capability } from '@/lib/capabilities'

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((amount: number, currency: string) => `${currency}:${amount}`),
  formatMoneyTotals: vi.fn((totals: { currency: string; live_total: number }[]) =>
    totals.length ? totals.map((t) => `${t.currency}:${t.live_total}`).join(' + ') : '-',
  ),
}))
vi.mock('@/lib/time/format', () => ({ todayInZone: vi.fn(() => '2026-07-16') }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForTutor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn(async () => 'Asia/Kolkata') }))
vi.mock('@/lib/services/calendar-events', () => ({ listEvents: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ countActiveClasses: vi.fn(), listClassesByIds: vi.fn() }))
vi.mock('@/lib/services/enrollments', () => ({ countEnrollmentsPerClass: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ financeTotals: vi.fn() }))
vi.mock('@/lib/services/reminders', () => ({ listMyPastReminders: vi.fn(), listMyReminders: vi.fn() }))
vi.mock('@/lib/services/users', () => ({
  countPeople: vi.fn(),
  getProfilesByIds: vi.fn(),
  displayName: vi.fn((profile: { full_name: string | null; email: string }) => profile.full_name ?? profile.email),
}))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))

import { listEvents } from '@/lib/services/calendar-events'
import { selectActiveClassIdsForTutor } from '@/lib/data/class-membership'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { countActiveClasses, listClassesByIds } from '@/lib/services/classes'
import { countEnrollmentsPerClass } from '@/lib/services/enrollments'
import { financeTotals } from '@/lib/services/finance/finance-docs'
import { listMyPastReminders, listMyReminders } from '@/lib/services/reminders'
import { countPeople, getProfilesByIds } from '@/lib/services/users'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { loadDashboardViewData, loadDashboardMentees } from '@/lib/services/page-data/dashboard'

const caps = (...names: Capability[]) => new Set<Capability>(names)
const flags = (
  input: Partial<Record<'isAdmin' | 'isSubAdmin' | 'isTutor' | 'isStudent' | 'hasMentorAuthority', boolean>>,
) =>
  ({
    personas: [],
    isAdmin: false,
    isSubAdmin: false,
    isTutor: false,
    isManager: false,
    isStudent: false,
    isMentor: false,
    hasMentorAuthority: false,
    ...input,
  }) as any

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectActiveClassIdsForTutor).mockResolvedValue([])
})

describe('loadDashboardViewData', () => {
  it('loads and shapes the admin dashboard view model', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isAdmin: true }))
    vi.mocked(listEvents).mockResolvedValueOnce([
      { id: 'e1', title: 'Exam', event_date: '2026-07-16', kind: 'exam' },
    ] as any)
    vi.mocked(listMyReminders).mockResolvedValueOnce([{ id: 'r1' }] as any)
    vi.mocked(listMyPastReminders).mockResolvedValueOnce([{ id: 'r2' }] as any)
    vi.mocked(countPeople).mockResolvedValueOnce({ students: 10, tutors: 2, pending: 1 } as any)
    vi.mocked(countActiveClasses).mockResolvedValueOnce(3 as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([
      { id: 'c1', name: 'Math', status: 'active' },
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

    await expect(
      loadDashboardViewData({ id: 'admin-1', role: 'admin' } as any, caps('viewUsers', 'viewFinance')),
    ).resolves.toEqual({
      kind: 'admin',
      now: expect.any(Number),
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

  it('excludes archived classes from the per-class chart BEFORE the top-6 slice', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isAdmin: true }))
    vi.mocked(listEvents).mockResolvedValueOnce([] as any)
    vi.mocked(listMyReminders).mockResolvedValueOnce([] as any)
    vi.mocked(listMyPastReminders).mockResolvedValueOnce([] as any)
    vi.mocked(countPeople).mockResolvedValueOnce({ students: 0, tutors: 0, pending: 0 } as any)
    vi.mocked(countActiveClasses).mockResolvedValueOnce(2 as any)
    // The archived class has the HIGHEST enrolment count: if it were sliced into
    // the top-6 before filtering, it would consume a bar and hide an active class.
    vi.mocked(listClassesByIds).mockResolvedValueOnce([
      { id: 'arch', name: 'Old class', status: 'archived' },
      { id: 'c1', name: 'Math', status: 'active' },
      { id: 'c3', name: 'English', status: 'active' },
    ] as any)
    vi.mocked(countEnrollmentsPerClass).mockResolvedValueOnce(
      new Map([
        ['arch', 99],
        ['c1', 22],
        ['c3', 17],
      ]) as any,
    )

    await expect(
      loadDashboardViewData({ id: 'admin-1', role: 'admin' } as any, caps('viewUsers')),
    ).resolves.toMatchObject({
      kind: 'admin',
      perClass: [
        { label: 'Math', value: 22 },
        { label: 'English', value: 17 },
      ],
    })
  })

  it('omits admin user and finance aggregates when those capabilities are denied', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isAdmin: true }))
    vi.mocked(listEvents).mockResolvedValueOnce([] as any)
    vi.mocked(listMyReminders).mockResolvedValueOnce([] as any)
    vi.mocked(listMyPastReminders).mockResolvedValueOnce([] as any)
    vi.mocked(countActiveClasses).mockResolvedValueOnce(3 as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([{ id: 'c1', name: 'Math', status: 'active' }] as any)
    vi.mocked(countEnrollmentsPerClass).mockResolvedValueOnce(new Map([['c1', 22]]) as any)

    await expect(loadDashboardViewData({ id: 'admin-1', role: 'admin' } as any, caps())).resolves.toEqual({
      kind: 'admin',
      now: expect.any(Number),
      upcoming: [],
      reminders: [],
      pastReminders: [],
      peopleCounts: null,
      activeClassCount: 3,
      perClass: [{ label: 'Math', value: 22 }],
      revenueLabel: null,
      payoutLabel: null,
    })
    expect(countPeople).not.toHaveBeenCalled()
    expect(financeTotals).not.toHaveBeenCalled()
  })

  it('keeps the finance card data reachable for an admin with finance access even when the ledger is empty', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isAdmin: true }))
    vi.mocked(listEvents).mockResolvedValueOnce([] as any)
    vi.mocked(listMyReminders).mockResolvedValueOnce([] as any)
    vi.mocked(listMyPastReminders).mockResolvedValueOnce([] as any)
    vi.mocked(countPeople).mockResolvedValueOnce(null as any)
    vi.mocked(countActiveClasses).mockResolvedValueOnce(0 as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    vi.mocked(countEnrollmentsPerClass).mockResolvedValueOnce(new Map() as any)
    vi.mocked(financeTotals)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)

    await expect(loadDashboardViewData({ id: 'admin-1', role: 'admin' } as any, caps('viewFinance'))).resolves.toEqual({
      kind: 'admin',
      now: expect.any(Number),
      upcoming: [],
      reminders: [],
      pastReminders: [],
      peopleCounts: null,
      activeClassCount: 0,
      perClass: [],
      revenueLabel: '-',
      payoutLabel: '-',
    })
  })

  it('loads the sub-admin dashboard counts only', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isSubAdmin: true }))
    vi.mocked(countPeople).mockResolvedValueOnce({ students: 9, tutors: 4, pending: 2 } as any)

    await expect(loadDashboardViewData({ id: 'sub-1', role: 'sub_admin' } as any, caps('viewUsers'))).resolves.toEqual({
      kind: 'sub_admin',
      now: expect.any(Number),
      canViewUsers: true,
      students: 9,
      tutors: 4,
      pending: 2,
    })
    expect(listEvents).not.toHaveBeenCalled()
  })

  it('suppresses sub-admin user aggregates when viewUsers is revoked', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isSubAdmin: true }))
    await expect(loadDashboardViewData({ id: 'sub-1', role: 'sub_admin' } as any, caps())).resolves.toEqual({
      kind: 'sub_admin',
      now: expect.any(Number),
      canViewUsers: false,
      students: 0,
      tutors: 0,
      pending: 0,
    })
    expect(countPeople).not.toHaveBeenCalled()
  })

  it('returns the tutor view kind for a tutor with no mentees, without admin aggregates', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isTutor: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce([]) // no mentees -> stays 'tutor'

    await expect(loadDashboardViewData({ id: 'tutor-1', role: 'tutor' } as any, caps())).resolves.toEqual({
      kind: 'tutor',
      now: expect.any(Number),
    })
    expect(countPeople).not.toHaveBeenCalled()
  })

  it('refines a tutor WITH mentees to the mentor view kind (mentees + teaching)', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isTutor: true, hasMentorAuthority: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
      ]) as any,
    )

    await expect(loadDashboardViewData({ id: 'mentor-1', role: 'tutor' } as any, caps())).resolves.toEqual({
      kind: 'mentor',
      now: expect.any(Number),
      mentees: [{ id: 's-1', name: 'Sara', subtitle: 'Grade 10' }],
      teaches: true, // a tutor who mentors keeps the teaching widgets
    })
  })

  it('resolves a dedicated mentor account to the mentor view without teaching widgets', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ hasMentorAuthority: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1', 's-2'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
        ['s-2', { id: 's-2', full_name: 'Sam', email: 'sam@test.dev', role: 'student', class_level: 'Grade 9' }],
      ]),
    )

    await expect(loadDashboardViewData({ id: 'maya-mentor', role: 'mentor' } as any, caps())).resolves.toEqual({
      kind: 'mentor',
      now: expect.any(Number),
      mentees: [
        { id: 's-1', name: 'Sara', subtitle: 'Grade 10' },
        { id: 's-2', name: 'Sam', subtitle: 'Grade 9' },
      ],
      teaches: false, // a dedicated mentor teaches nothing
    })
  })

  it('resolves a dedicated mentor with no mentees yet to the mentor view instead of crashing', async () => {
    // A freshly-provisioned mentor holds the global mentor persona (mentor
    // authority) but has no mentorships until an admin assigns one. This must
    // land on the mentor dashboard, not throw identity_unmapped and 500 the
    // landing page.
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ hasMentorAuthority: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce([])

    await expect(loadDashboardViewData({ id: 'new-mentor', role: 'mentor' } as any, caps())).resolves.toEqual({
      kind: 'mentor',
      now: expect.any(Number),
      mentees: [],
      teaches: false,
    })
  })

  it('keeps a teaching mentor on the mentor dashboard with tutor widgets', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ hasMentorAuthority: true }))
    vi.mocked(selectActiveClassIdsForTutor).mockResolvedValueOnce(['c-1'])
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
      ]) as any,
    )

    await expect(loadDashboardViewData({ id: 'mentor-1', role: 'mentor' } as any, caps())).resolves.toEqual({
      kind: 'mentor',
      now: expect.any(Number),
      mentees: [{ id: 's-1', name: 'Sara', subtitle: 'Grade 10' }],
      teaches: true,
    })
  })

  it('returns the student view for a student persona', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isStudent: true }))
    await expect(loadDashboardViewData({ id: 'student-1', role: 'student' } as any, caps())).resolves.toEqual({
      kind: 'student',
      now: expect.any(Number),
    })
  })

  it('returns the generic dashboard view for an unmapped persona state', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({}))
    await expect(loadDashboardViewData({ id: 'mystery-1', role: 'student' } as any, caps())).resolves.toEqual({
      kind: 'generic',
      now: expect.any(Number),
    })
  })
})

describe('loadDashboardMentees', () => {
  it('returns empty and skips the name lookup when the actor mentors nobody', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce([])
    await expect(loadDashboardMentees({ id: 'tutor-1' } as any)).resolves.toEqual([])
    expect(getProfilesByIds).not.toHaveBeenCalled()
  })

  it('resolves the actor own mentees to id + name, preserving order', async () => {
    vi.mocked(studentIdsOfMentor).mockResolvedValueOnce(['s-1', 's-2'])
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Sara', email: 'sara@test.dev', role: 'student', class_level: 'Grade 10' }],
        ['s-2', { id: 's-2', full_name: 'Sam', email: 'sam@test.dev', role: 'student', class_level: 'Grade 9' }],
      ]),
    )
    await expect(loadDashboardMentees({ id: 'mentor-1' } as any)).resolves.toEqual([
      { id: 's-1', name: 'Sara', subtitle: 'Grade 10' },
      { id: 's-2', name: 'Sam', subtitle: 'Grade 9' },
    ])
  })
})
