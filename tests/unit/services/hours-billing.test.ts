import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/teaching-hours', () => ({ getAcademyClassHours: vi.fn() }))
vi.mock('@/lib/data/billing-rates', () => ({
  selectBillingRatesFor: vi.fn(),
  selectPartiesWithDocForPeriod: vi.fn(),
}))

import { getProfileById } from '@/lib/services/users'
import { getAcademyClassHours } from '@/lib/services/teaching-hours'
import { selectBillingRatesFor, selectPartiesWithDocForPeriod } from '@/lib/data/billing-rates'
import { buildBillingDraft } from '@/lib/services/finance/hours-billing'

const STUDENT = 'a0000000-0000-4000-8000-000000000030'
const TUTOR = 'a0000000-0000-4000-8000-000000000010'

const profile = (over: Record<string, unknown>) =>
  ({ id: STUDENT, full_name: 'Sam Student', email: 's@x', role: 'student', status: 'active', ...over }) as never

/** 90 minutes in "Maths", 60 in "Science", for whichever side the test needs. */
function hours(over: Record<string, unknown> = {}) {
  return {
    personTotals: [],
    tutorClasses: [
      {
        classId: 'C1',
        className: 'Maths',
        totalMinutes: 90,
        tutors: [{ tutorId: TUTOR, tutorName: 'T', minutes: 90, sessionCount: 1 }],
      },
      {
        classId: 'C2',
        className: 'Science',
        totalMinutes: 60,
        tutors: [{ tutorId: TUTOR, tutorName: 'T', minutes: 60, sessionCount: 1 }],
      },
    ],
    studentClasses: [
      {
        classId: 'C1',
        className: 'Maths',
        totalMinutes: 90,
        students: [{ studentId: STUDENT, studentName: 'S', minutes: 90, sessionCount: 1 }],
      },
      {
        classId: 'C2',
        className: 'Science',
        totalMinutes: 60,
        students: [{ studentId: STUDENT, studentName: 'S', minutes: 60, sessionCount: 1 }],
      },
    ],
    ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProfileById).mockResolvedValue(profile({}))
  vi.mocked(getAcademyClassHours).mockResolvedValue(hours())
  vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set())
  vi.mocked(selectBillingRatesFor).mockResolvedValue(
    new Map([[STUDENT, { profile_id: STUDENT, fee_rate: 400, pay_rate: null, currency: 'INR' }]]),
  )
})

describe('buildBillingDraft - receipt (student)', () => {
  it('bills the hours the student received at their fee rate', async () => {
    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.currency).toBe('INR')
    expect(draft.lines).toEqual([
      { subject: 'Maths', hours: 1.5, rate: 400, amount: 600 },
      { subject: 'Science', hours: 1, rate: 400, amount: 400 },
    ])
    expect(draft.subtotal).toBe(1000)
    expect(draft.total).toBe(1000)
  })

  it('blocks when the student has no fee rate rather than billing zero', async () => {
    vi.mocked(selectBillingRatesFor).mockResolvedValue(new Map())

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.lines).toEqual([])
    expect(draft.blocked).toMatch(/no fee rate/i)
  })

  it('blocks when a rate row exists but the fee side is unset', async () => {
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[STUDENT, { profile_id: STUDENT, fee_rate: null, pay_rate: 500, currency: 'INR' }]]),
    )

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.blocked).toMatch(/no fee rate/i)
  })

  it('blocks when the student attended nothing that month', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(hours({ studentClasses: [] }))

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.lines).toEqual([])
    expect(draft.blocked).toMatch(/attended no recorded sessions/i)
  })

  it('drops a class whose sessions have no recorded window (0 minutes is not a line)', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(
      hours({
        studentClasses: [
          {
            classId: 'C1',
            className: 'Maths',
            totalMinutes: 90,
            students: [{ studentId: STUDENT, studentName: 'S', minutes: 90, sessionCount: 1 }],
          },
          {
            classId: 'C2',
            className: 'Science',
            totalMinutes: 0,
            students: [{ studentId: STUDENT, studentName: 'S', minutes: 0, sessionCount: 2 }],
          },
        ],
      }),
    )

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.lines.map((l) => l.subject)).toEqual(['Maths'])
  })

  it("never bills one student for another student's hours", async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(
      hours({
        studentClasses: [
          {
            classId: 'C1',
            className: 'Maths',
            totalMinutes: 150,
            students: [
              { studentId: STUDENT, studentName: 'S', minutes: 90, sessionCount: 1 },
              { studentId: 'someone-else', studentName: 'Other', minutes: 60, sessionCount: 1 },
            ],
          },
        ],
      }),
    )

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.lines).toEqual([{ subject: 'Maths', hours: 1.5, rate: 400, amount: 600 }])
  })

  it('warns, but still fills, when a live receipt already covers the month', async () => {
    vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set([STUDENT]))

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.lines).toHaveLength(2)
    expect(draft.warnings[0]).toMatch(/already been issued/i)
  })

  it('refuses a party who is not an active student', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ status: 'disabled' }))

    await expect(buildBillingDraft('receipt', STUDENT, '2026-09')).rejects.toThrow(/no active student/i)
  })

  it('refuses to issue in a currency the system cannot render', async () => {
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[STUDENT, { profile_id: STUDENT, fee_rate: 400, pay_rate: null, currency: 'ZWL' }]]),
    )

    const draft = await buildBillingDraft('receipt', STUDENT, '2026-09')

    expect(draft.blocked).toMatch(/not a currency/i)
  })
})

describe('buildBillingDraft - pay slip (tutor/mentor)', () => {
  beforeEach(() => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, full_name: 'Tara Tutor', role: 'tutor' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[TUTOR, { profile_id: TUTOR, fee_rate: null, pay_rate: 500, currency: 'INR' }]]),
    )
  })

  it('pays the hours the tutor taught at their pay rate', async () => {
    const draft = await buildBillingDraft('payslip', TUTOR, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.lines).toEqual([
      { subject: 'Maths', hours: 1.5, rate: 500, amount: 750 },
      { subject: 'Science', hours: 1, rate: 500, amount: 500 },
    ])
    expect(draft.total).toBe(1250)
  })

  it('accepts a mentor as a payee', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, full_name: 'Maya Mentor', role: 'mentor' }))

    const draft = await buildBillingDraft('payslip', TUTOR, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.partyName).toBe('Maya Mentor')
  })

  it('refuses a student as a payee', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'student' }))

    await expect(buildBillingDraft('payslip', TUTOR, '2026-09')).rejects.toThrow(/no active payee/i)
  })

  it('blocks when the tutor taught nothing that month', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(hours({ tutorClasses: [] }))

    const draft = await buildBillingDraft('payslip', TUTOR, '2026-09')

    expect(draft.blocked).toMatch(/taught no recorded sessions/i)
  })

  it('checks the pay-slip ledger, not the receipt ledger, for a duplicate', async () => {
    await buildBillingDraft('payslip', TUTOR, '2026-09')

    expect(selectPartiesWithDocForPeriod).toHaveBeenCalledWith('payslip', '2026-09')
  })
})
