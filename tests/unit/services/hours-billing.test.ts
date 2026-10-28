import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/teaching-hours', () => ({ getAcademyClassHours: vi.fn() }))
vi.mock('@/lib/services/hours-breakdown', () => ({
  getAcademyBreakdown: vi.fn(),
  getPersonWork: vi.fn(),
  NO_SUBJECT: 'No subject set',
}))
vi.mock('@/lib/data/billing-rates', () => ({
  selectBillingRatesFor: vi.fn(),
  selectPartiesWithDocForPeriod: vi.fn(),
}))
// The self-recorded-hours warning (C-06) resolves the institute timezone to bound the
// month, and org-settings reads through Next's unstable_cache - which has no incremental
// cache in a unit test. Mocked here rather than dropped from the service: counting the
// window in UTC instead would count a DIFFERENT set of sessions than the ones being
// billed, so the warning could disagree with the lines above it.
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn(async () => 'Asia/Kolkata') }))
vi.mock('@/lib/data/class-sessions', () => ({ countSelfRecordedSessions: vi.fn(async () => 0) }))

import { getProfileById } from '@/lib/services/users'
import { getAcademyClassHours } from '@/lib/services/teaching-hours'
import { getAcademyBreakdown, getPersonWork } from '@/lib/services/hours-breakdown'
import { selectBillingRatesFor, selectPartiesWithDocForPeriod } from '@/lib/data/billing-rates'
import { countSelfRecordedSessions } from '@/lib/data/class-sessions'
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

/** One session of a payee's own ledger - the sessions they WORKED, as My hours lists them. */
const worked = (classId: string, subjectName: string, minutes: number, kind = 'regular', role = 'taught') => ({
  sessionId: `s-${classId}-${subjectName}-${minutes}-${kind}`,
  classId,
  sessionDate: '2026-09-01',
  startAt: null,
  endAt: null,
  minutes,
  subjectName,
  kind,
  role,
  studentNames: [],
})
const ledgerOf = (...rows: ReturnType<typeof worked>[]) => ({ hours: {}, ledger: rows }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPersonWork).mockResolvedValue(ledgerOf(worked('C1', 'Maths', 90), worked('C2', 'Science', 60)))
  vi.mocked(getProfileById).mockResolvedValue(profile({}))
  vi.mocked(getAcademyClassHours).mockResolvedValue(hours())
  vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set())
  vi.mocked(getAcademyBreakdown).mockResolvedValue({ month: '2026-08', people: [], students: [] })
  vi.mocked(selectBillingRatesFor).mockResolvedValue(
    new Map([[STUDENT, { profile_id: STUDENT, fee_rate: 400, pay_rate: null, currency: 'INR' }]]),
  )
})

const ACTOR = 'admin-1'

describe('buildBillingDraft - receipt (student)', () => {
  it('bills the hours the student received at their fee rate', async () => {
    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

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

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

    expect(draft.lines).toEqual([])
    expect(draft.blocked).toMatch(/no fee rate/i)
  })

  it('blocks when a rate row exists but the fee side is unset', async () => {
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[STUDENT, { profile_id: STUDENT, fee_rate: null, pay_rate: 500, currency: 'INR' }]]),
    )

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

    expect(draft.blocked).toMatch(/no fee rate/i)
  })

  it('blocks when the student attended nothing that month', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(hours({ studentClasses: [] }))

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

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

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

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

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

    expect(draft.lines).toEqual([{ subject: 'Maths', hours: 1.5, rate: 400, amount: 600 }])
  })

  it('warns, but still fills, when a live receipt already covers the month', async () => {
    vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set([STUDENT]))

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.lines).toHaveLength(2)
    expect(draft.warnings[0]).toMatch(/already been issued/i)
  })

  it('refuses a party who is not an active student', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ status: 'disabled' }))

    await expect(buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')).rejects.toThrow(/no active student/i)
  })

  it('refuses to issue in a currency the system cannot render', async () => {
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[STUDENT, { profile_id: STUDENT, fee_rate: 400, pay_rate: null, currency: 'ZWL' }]]),
    )

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')

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

  it('pays the sessions the payee worked at their pay rate', async () => {
    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.lines).toEqual([
      { subject: 'Maths', hours: 1.5, rate: 500, amount: 750 },
      { subject: 'Science', hours: 1, rate: 500, amount: 500 },
    ])
    expect(draft.total).toBe(1250)
  })

  it('accepts a mentor as a payee', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, full_name: 'Maya Mentor', role: 'mentor' }))

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.blocked).toBeNull()
    expect(draft.partyName).toBe('Maya Mentor')
  })

  it('refuses a student as a payee', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'student' }))

    await expect(buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')).rejects.toThrow(/no active payee/i)
  })

  it('blocks when the payee worked nothing that month', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(null)

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.blocked).toMatch(/taught no recorded sessions/i)
  })

  it("reads the payee's own ledger, which is the one they see as My hours", async () => {
    await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(getPersonWork).toHaveBeenCalledWith(ACTOR, TUTOR, '2026-09')
  })

  it('pays an exam they monitored, as working time', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(
      ledgerOf(worked('C1', 'Maths', 60), worked('C1', 'Maths', 30, 'exam', 'monitored')),
    )

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.lines).toEqual([{ subject: 'Maths', hours: 1.5, rate: 500, amount: 750 }])
  })

  it('never pays a demo class: it is not working time', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(ledgerOf(worked('C1', 'Maths', 60), worked('C1', 'Maths', 45, 'demo')))

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.lines).toEqual([{ subject: 'Maths', hours: 1, rate: 500, amount: 500 }])
  })

  it('is blocked, not zero-priced, when the only sessions were demos', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(ledgerOf(worked('C1', 'Maths', 45, 'demo')))

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.lines).toEqual([])
    expect(draft.blocked).toMatch(/no recorded sessions/i)
  })

  it('keeps a line per subject in a class, and names a class with no subject by the class', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(
      ledgerOf(worked('C1', 'Maths', 60), worked('C1', 'Algebra', 30), worked('C2', 'No subject set', 60)),
    )

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.lines.map((l) => [l.subject, l.hours]).sort()).toEqual([
      ['Algebra', 0.5],
      ['Maths', 1],
      ['Science', 1],
    ])
  })

  it('drops a session with no recorded window rather than billing a zero-hour line', async () => {
    vi.mocked(getPersonWork).mockResolvedValue(ledgerOf(worked('C1', 'Maths', 60), worked('C2', 'Science', 0)))

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(draft.lines.map((l) => l.subject)).toEqual(['Maths'])
  })

  it('checks the pay-slip ledger, not the receipt ledger, for a duplicate', async () => {
    await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-09')

    expect(selectPartiesWithDocForPeriod).toHaveBeenCalledWith('payslip', '2026-09')
  })
})

/**
 * C-06: a tutor records the very sessions that become their own pay. Issuance is
 * admin-only, so the admin is the second party - but only if they can SEE which hours
 * nobody but the payee attested. 0102 records who entered them; this surfaces it.
 */
describe('demo and exam hours in a billed month', () => {
  const kinds = (demo: number, exam: number) => ({ regular: 90, demo, exam })

  it('warns a receipt that the month holds demo and exam hours priced as regular', async () => {
    vi.mocked(getAcademyBreakdown).mockResolvedValue({
      month: '2026-08',
      people: [],
      students: [{ studentId: STUDENT, total: kinds(30, 60) }],
    } as never)
    const draft = await buildBillingDraft('admin-1', 'receipt', STUDENT, '2026-08')
    expect(draft.blocked).toBeNull()
    expect(draft.warnings).toEqual([expect.stringContaining('0.5 h of demo classes and 1 h of exams')])
  })

  it('tells the admin an exam is paid at the regular rate, since only who is paid is settled', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'tutor' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[TUTOR, { profile_id: TUTOR, fee_rate: null, pay_rate: 500, currency: 'INR' }]]),
    )
    vi.mocked(getAcademyBreakdown).mockResolvedValue({
      month: '2026-08',
      people: [{ personId: TUTOR, minutes: kinds(0, 60) }],
      students: [],
    } as never)
    const draft = await buildBillingDraft('admin-1', 'payslip', TUTOR, '2026-08')
    expect(draft.warnings).toEqual([expect.stringContaining('1 h of exam monitoring, paid at the regular hourly rate')])
  })

  it('warns a pay slip from the payee own working minutes', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'tutor' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[TUTOR, { profile_id: TUTOR, fee_rate: null, pay_rate: 500, currency: 'INR' }]]),
    )
    vi.mocked(getAcademyBreakdown).mockResolvedValue({
      month: '2026-08',
      people: [{ personId: TUTOR, minutes: kinds(45, 0) }],
      students: [],
    } as never)
    const draft = await buildBillingDraft('admin-1', 'payslip', TUTOR, '2026-08')
    expect(draft.warnings).toEqual([expect.stringContaining('0.75 h of demo classes this month are not paid')])
  })

  it('says nothing when the month is all regular classes', async () => {
    vi.mocked(getAcademyBreakdown).mockResolvedValue({
      month: '2026-08',
      people: [],
      students: [{ studentId: STUDENT, total: kinds(0, 0) }],
    } as never)
    const draft = await buildBillingDraft('admin-1', 'receipt', STUDENT, '2026-08')
    expect(draft.warnings).toEqual([])
  })
})

describe('self-recorded hours warning (C-06)', () => {
  it('warns when the payee entered their own hours, naming how many', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'tutor', full_name: 'Tara Tutor' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[TUTOR, { pay_rate: 500, fee_rate: null, currency: 'INR' }]]) as never,
    )
    vi.mocked(getAcademyClassHours).mockResolvedValue({
      tutorClasses: [{ className: 'Maths', tutors: [{ tutorId: TUTOR, minutes: 120 }] }],
      studentClasses: [],
    } as never)
    vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set() as never)
    vi.mocked(countSelfRecordedSessions).mockResolvedValue(3)

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-08')
    expect(draft.warnings.some((w) => /3 of this month's sessions .* entered by the payee/i.test(w))).toBe(true)
  })

  it('says nothing when someone else recorded the hours', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: TUTOR, role: 'tutor', full_name: 'Tara Tutor' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[TUTOR, { pay_rate: 500, fee_rate: null, currency: 'INR' }]]) as never,
    )
    vi.mocked(getAcademyClassHours).mockResolvedValue({
      tutorClasses: [{ className: 'Maths', tutors: [{ tutorId: TUTOR, minutes: 120 }] }],
      studentClasses: [],
    } as never)
    vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set() as never)
    vi.mocked(countSelfRecordedSessions).mockResolvedValue(0)

    const draft = await buildBillingDraft(ACTOR, 'payslip', TUTOR, '2026-08')
    expect(draft.warnings.some((w) => /entered by the payee/i.test(w))).toBe(false)
  })

  it('does not raise it for a RECEIPT - a student does not record their own hours', async () => {
    vi.mocked(getProfileById).mockResolvedValue(profile({ id: STUDENT, role: 'student' }))
    vi.mocked(selectBillingRatesFor).mockResolvedValue(
      new Map([[STUDENT, { pay_rate: null, fee_rate: 400, currency: 'INR' }]]) as never,
    )
    vi.mocked(getAcademyClassHours).mockResolvedValue({
      tutorClasses: [],
      studentClasses: [{ className: 'Maths', students: [{ studentId: STUDENT, minutes: 60 }] }],
    } as never)
    vi.mocked(selectPartiesWithDocForPeriod).mockResolvedValue(new Set() as never)
    vi.mocked(countSelfRecordedSessions).mockResolvedValue(9)

    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-08')
    expect(draft.warnings.some((w) => /entered by the payee/i.test(w))).toBe(false)
    expect(countSelfRecordedSessions, 'the count is not even queried for a receipt').not.toHaveBeenCalled()
  })
})

/**
 * A receipt line is stored in receipt_lines.SUBJECT, and until now it carried the CLASS
 * NAME. For a class named for a level ("C12") that prints a level in a column headed
 * Subject, and it drifts: rename the class and a newly issued back-dated receipt relabels
 * work that was taught under the old name. 0104 records the subject each session actually
 * taught, so the line uses that when the month's sessions agree on one, and falls back to
 * the class name when they do not - a wrong subject on a fee document being worse than a
 * blunt one.
 */
describe('billing lines are labelled by the subject taught', () => {
  it('uses the recorded subject in place of the class name', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(
      hours({
        studentClasses: [
          {
            classId: 'C1',
            className: 'C12',
            subjectName: 'Mathematics',
            totalMinutes: 90,
            students: [{ studentId: STUDENT, studentName: 'S', minutes: 90, sessionCount: 1 }],
          },
        ],
      }),
    )
    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')
    expect(draft.lines.map((l) => l.subject)).toEqual(['Mathematics'])
  })

  it('falls back to the class name when the sessions name no single subject', async () => {
    vi.mocked(getAcademyClassHours).mockResolvedValue(
      hours({
        studentClasses: [
          {
            classId: 'C1',
            className: 'C12',
            subjectName: null,
            totalMinutes: 90,
            students: [{ studentId: STUDENT, studentName: 'S', minutes: 90, sessionCount: 1 }],
          },
        ],
      }),
    )
    const draft = await buildBillingDraft(ACTOR, 'receipt', STUDENT, '2026-09')
    expect(draft.lines.map((l) => l.subject)).toEqual(['C12'])
  })
})
