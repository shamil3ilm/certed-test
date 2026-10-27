import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/analytics', () => ({
  countSessionsWithoutTimes: vi.fn(),
  selectSessionNotesByIds: vi.fn(),
  selectAttendedForSessions: vi.fn(),
  selectMarksForStudentInDates: vi.fn(),
  selectSessionsByIdsInRange: vi.fn(),
  selectSessionsForClassesInRange: vi.fn(),
  selectSessionsWorkedByPersonInRange: vi.fn(),
}))
vi.mock('@/lib/data/classes', () => ({ selectArchivedClassIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveStudentIdsByClassIds: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ isMentoringOversight: vi.fn(), mentoringScopeClassIds: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/permission/mentor', () => ({ canMentor: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileLabelsByIds: vi.fn() }))

import {
  countSessionsWithoutTimes,
  selectSessionNotesByIds,
  selectAttendedForSessions,
  selectMarksForStudentInDates,
  selectSessionsByIdsInRange,
  selectSessionsForClassesInRange,
  selectSessionsWorkedByPersonInRange,
} from '@/lib/data/analytics'
import { selectArchivedClassIds } from '@/lib/data/classes'
import { selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
import { isMentoringOversight, mentoringScopeClassIds } from '@/lib/permission/class'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { canMentor } from '@/lib/permission/mentor'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { requireActorCapability } from '@/lib/services/authorization'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { getProfileLabelsByIds } from '@/lib/services/users'
import {
  getAcademyBreakdown,
  getMenteesHoursReceived,
  getMyHoursWorked,
  getPersonWork,
  getMyWork,
  getStudentHoursReceived,
  getStudentMonth,
} from '@/lib/services/hours-breakdown'

/**
 * WHO may read WHOSE hours, and that a read is scoped to the person it is for. The numbers
 * themselves are the engine's (hours-breakdown.test.ts); these pin the authority around them.
 */

const TUTOR = 'tutor-1'
const OTHER = 'tutor-2'
const MON = 'monitor-1'
const SARA = 'student-sara'
const MATHS = 'subj-maths'

const actor = (id: string) => ({ id }) as never

function session(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    class_id: 'class-1',
    tutor_id: TUTOR,
    monitor_id: null,
    subject_id: MATHS,
    kind: 'regular',
    actual_start: '2026-08-05T10:00:00.000Z',
    actual_end: '2026-08-05T11:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getInstituteTimeZone).mockResolvedValue('UTC')
  vi.mocked(selectSessionNotesByIds).mockResolvedValue(new Map())
  vi.mocked(selectArchivedClassIds).mockResolvedValue([])
  vi.mocked(selectSubjectsByIds).mockResolvedValue([{ id: MATHS, name: 'Maths' }] as never)
  vi.mocked(getProfileLabelsByIds).mockResolvedValue(
    new Map([
      [TUTOR, { name: 'Tarun Tutor', role: 'tutor' }],
      [OTHER, { name: 'Olga Other', role: 'tutor' }],
      [MON, { name: 'Maya Monitor', role: 'mentor' }],
      [SARA, { name: 'Sara Student', role: 'student' }],
    ]),
  )
  vi.mocked(requireActorCapability).mockResolvedValue(undefined as never)
  vi.mocked(canMentor).mockResolvedValue(false)
  vi.mocked(loadPersonaFlags).mockResolvedValue({ isSubAdmin: false } as never)
})

describe('getAcademyBreakdown', () => {
  it('requires manageClasses before reading anything', async () => {
    vi.mocked(requireActorCapability).mockRejectedValue(new Error('no'))
    await expect(getAcademyBreakdown('tutor-1', '2026-08')).rejects.toThrow('no')
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })

  it('returns nothing, and reads no attendance, for a month with no sessions', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])
    expect(await getAcademyBreakdown('admin-1', '2026-08')).toEqual({ month: '2026-08', people: [], students: [] })
    expect(selectAttendedForSessions).not.toHaveBeenCalled()
  })

  it('leaves archived classes out, as the Class hours report does', async () => {
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['old-class'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])
    await getAcademyBreakdown('admin-1', '2026-08')
    expect(selectSessionsForClassesInRange).toHaveBeenCalledWith(null, expect.any(String), expect.any(String), [
      'old-class',
    ])
  })

  it('counts the sessions of the month that have no recorded times, archived classes left out', async () => {
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['old-class'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])
    vi.mocked(countSessionsWithoutTimes).mockResolvedValue(3)
    const out = await getAcademyBreakdown('admin-1', '2026-08')
    expect(countSessionsWithoutTimes).toHaveBeenCalledWith('2026-08-01', '2026-09-01', ['old-class'])
    expect(out.untimedSessions).toBe(3)
  })

  it('names the people, students and subjects it reports', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([session('s1')] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([{ session_id: 's1', student_id: SARA }])
    const out = await getAcademyBreakdown('admin-1', '2026-08')
    expect(out.people[0]).toMatchObject({ personName: 'Tarun Tutor', personRole: 'tutor' })
    expect(out.people[0].bySubject[0].subjectName).toBe('Maths')
    expect(out.people[0].byStudent[0].studentName).toBe('Sara Student')
    expect(out.students[0]).toMatchObject({ studentName: 'Sara Student' })
    expect(out.students[0].byTutor[0].tutorName).toBe('Tarun Tutor')
  })

  it('labels a session with no tutor as Unassigned and no attendance as such', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([session('s1', { tutor_id: null })] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([])
    const out = await getAcademyBreakdown('admin-1', '2026-08')
    expect(out.people[0].personName).toBe('Unassigned')
    expect(out.people[0].byStudent[0].studentName).toBe('No attendance recorded')
  })
})

describe('getPersonWork - an admin reading one named person', () => {
  it('needs the academy-wide capability, and reads that PERSON, not the actor', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([session('s1')] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([{ session_id: 's1', student_id: SARA }])
    const work = await getPersonWork('admin-1', TUTOR, '2026-08')
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageClasses', expect.any(String))
    expect(selectSessionsWorkedByPersonInRange).toHaveBeenCalledWith(TUTOR, expect.any(String), expect.any(String))
    expect(work?.ledger.map((r) => [r.sessionId, r.role])).toEqual([['s1', 'taught']])
  })

  it('refuses a caller without the capability before reading anything', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new Error('no'))
    await expect(getPersonWork('tutor-9', TUTOR, '2026-08')).rejects.toThrow()
    expect(selectSessionsWorkedByPersonInRange).not.toHaveBeenCalled()
  })

  it('returns null for a person who worked nothing that month', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([])
    expect(await getPersonWork('admin-1', TUTOR, '2026-08')).toBeNull()
  })
})

describe('getMyHoursWorked - scoped to the actor, never a parameter', () => {
  it('reads sessions for the ACTOR id', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([])
    await getMyHoursWorked(actor(TUTOR), '2026-08')
    expect(selectSessionsWorkedByPersonInRange).toHaveBeenCalledWith(TUTOR, expect.any(String), expect.any(String))
  })

  it('returns null when the person worked no hours that month', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([])
    expect(await getMyHoursWorked(actor(TUTOR), '2026-08')).toBeNull()
  })

  it('does not credit a tutor with an exam someone else monitored', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([
      session('regular'),
      session('exam', { kind: 'exam', monitor_id: MON }),
    ] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([])
    const mine = await getMyHoursWorked(actor(TUTOR), '2026-08')
    expect(mine?.minutes).toEqual({ regular: 60, demo: 0, exam: 0 })
  })

  it('credits the monitor with the exam', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([
      session('exam', { kind: 'exam', monitor_id: MON, tutor_id: TUTOR }),
    ] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([{ session_id: 'exam', student_id: SARA }])
    const mine = await getMyHoursWorked(actor(MON), '2026-08')
    expect(mine).toMatchObject({ personName: 'Maya Monitor', minutes: { regular: 0, demo: 0, exam: 60 } })
  })

  it('leaves archived classes out', async () => {
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['class-1'])
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([session('s1')] as never)
    expect(await getMyHoursWorked(actor(TUTOR), '2026-08')).toBeNull()
  })
})

describe('getStudentHoursReceived - who may read a student’s hours', () => {
  const marks = [{ session_id: 's1', student_id: SARA, status: 'present' as const, join_at: null, leave_at: null }]

  beforeEach(() => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue(marks)
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([session('s1')] as never)
  })

  it('lets a student read their own', async () => {
    const out = await getStudentHoursReceived(actor(SARA), SARA, '2026-08')
    expect(out?.total).toEqual({ regular: 60, demo: 0, exam: 0 })
  })

  it('lets their mentor (or an admin, by mentor authority) read them', async () => {
    vi.mocked(canMentor).mockResolvedValue(true)
    expect(await getStudentHoursReceived(actor('mentor-1'), SARA, '2026-08')).not.toBeNull()
  })

  it('lets a sub-admin read them', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isSubAdmin: true } as never)
    expect(await getStudentHoursReceived(actor('sub-1'), SARA, '2026-08')).not.toBeNull()
  })

  it('refuses another student, and a tutor who is not their mentor - and reads nothing', async () => {
    await expect(getStudentHoursReceived(actor('student-sam'), SARA, '2026-08')).rejects.toThrow(/Not allowed/)
    await expect(getStudentHoursReceived(actor(TUTOR), SARA, '2026-08')).rejects.toThrow(/Not allowed/)
    expect(selectMarksForStudentInDates).not.toHaveBeenCalled()
  })

  it('reads marks a day either side of the month, then keeps only sessions that START in it', async () => {
    await getStudentHoursReceived(actor(SARA), SARA, '2026-08')
    expect(selectMarksForStudentInDates).toHaveBeenCalledWith(SARA, '2026-07-31', '2026-09-02')
    expect(selectSessionsByIdsInRange).toHaveBeenCalledWith(
      ['s1'],
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    )
  })

  it('returns null when the student received nothing', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([])
    expect(await getStudentHoursReceived(actor(SARA), SARA, '2026-08')).toBeNull()
  })

  it('leaves archived classes out', async () => {
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['class-1'])
    expect(await getStudentHoursReceived(actor(SARA), SARA, '2026-08')).toBeNull()
  })

  it('names who monitored the student’s exam', async () => {
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([session('s1', { kind: 'exam', monitor_id: MON })] as never)
    const out = await getStudentHoursReceived(actor(SARA), SARA, '2026-08')
    expect(out?.examMonitors).toEqual([{ monitorId: MON, monitorName: 'Maya Monitor', minutes: 60 }])
  })
})

describe('getStudentMonth - the sessions behind a student`s totals', () => {
  const mark = (id: string, status: 'present' | 'late' | 'absent', join: string | null = null) => ({
    session_id: id,
    student_id: SARA,
    status,
    join_at: join,
    leave_at: null,
  })

  it('lists every mark - an absence included - with who taught it, oldest first', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([mark('b', 'absent'), mark('a', 'present')])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([
      session('a', {
        session_date: '2026-08-05',
        actual_start: '2026-08-05T10:00:00.000Z',
        actual_end: '2026-08-05T11:00:00.000Z',
      }),
      session('b', {
        session_date: '2026-08-06',
        actual_start: '2026-08-06T10:00:00.000Z',
        actual_end: '2026-08-06T10:30:00.000Z',
      }),
    ] as never)
    const { ledger } = await getStudentMonth(actor(SARA), SARA, '2026-08')
    expect(ledger.map((r) => [r.sessionId, r.status, r.counted])).toEqual([
      ['a', 'present', true],
      ['b', 'absent', false],
    ])
    expect(ledger[0]).toMatchObject({
      subjectName: 'Maths',
      tutorName: 'Tarun Tutor',
      sessionDate: '2026-08-05',
      minutes: 60,
    })
  })

  it('attaches the class summary and the student feedback only to a session they attended', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([mark('a', 'present'), mark('b', 'absent')])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([session('a'), session('b')] as never)
    vi.mocked(selectSessionNotesByIds).mockResolvedValue(
      new Map([['a', { summary: 'Covered fractions', student_feedback: 'Too fast' }]]),
    )
    const { ledger } = await getStudentMonth(actor(SARA), SARA, '2026-08')
    // The notes are looked up for the attended session only - the absent one is never asked about.
    expect(selectSessionNotesByIds).toHaveBeenCalledWith(['a'])
    expect(ledger.find((r) => r.sessionId === 'a')).toMatchObject({
      summary: 'Covered fractions',
      studentFeedback: 'Too fast',
    })
    expect(ledger.find((r) => r.sessionId === 'b')).toMatchObject({ summary: null, studentFeedback: null })
  })

  it('does not count an absence in the totals', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([mark('a', 'present'), mark('b', 'absent')])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([
      session('a', { minutes: 60 }),
      session('b', { minutes: 60 }),
    ] as never)
    const { hours } = await getStudentMonth(actor(SARA), SARA, '2026-08')
    expect(hours?.total).toEqual({ regular: 60, demo: 0, exam: 0 })
  })

  it('still reports the month - with zero hours - when every session was missed', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([mark('a', 'absent')])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([session('a')] as never)
    const out = await getStudentMonth(actor(SARA), SARA, '2026-08')
    expect(out.hours?.total).toEqual({ regular: 0, demo: 0, exam: 0 })
    expect(out.ledger).toHaveLength(1)
  })

  it('names an exam`s monitor and the student`s own join time', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([mark('e', 'late', '2026-08-05T10:07:00.000Z')])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([session('e', { kind: 'exam', monitor_id: MON })] as never)
    const { ledger } = await getStudentMonth(actor(SARA), SARA, '2026-08')
    expect(ledger[0]).toMatchObject({ kind: 'exam', monitorName: 'Maya Monitor', joinAt: '2026-08-05T10:07:00.000Z' })
  })

  it('refuses a stranger before reading anything', async () => {
    await expect(getStudentMonth(actor(TUTOR), SARA, '2026-08')).rejects.toThrow(/Not allowed/)
    expect(selectMarksForStudentInDates).not.toHaveBeenCalled()
  })

  it('has nothing for a month with no marks', async () => {
    vi.mocked(selectMarksForStudentInDates).mockResolvedValue([])
    vi.mocked(selectSessionsByIdsInRange).mockResolvedValue([])
    expect(await getStudentMonth(actor(SARA), SARA, '2026-08')).toEqual({ hours: null, ledger: [] })
  })
})

describe('getMyWork - a tutor`s or mentor`s own sessions', () => {
  it('lists what they taught with the student, and what they monitored as monitored', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([
      session('taught', { session_date: '2026-08-05' }),
      session('exam', { kind: 'exam', monitor_id: MON, session_date: '2026-08-06' }),
    ] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([{ session_id: 'exam', student_id: SARA }])

    const mon = await getMyWork(actor(MON), '2026-08')
    expect(mon?.ledger).toHaveLength(1)
    expect(mon?.ledger[0]).toMatchObject({ role: 'monitored', kind: 'exam', studentNames: ['Sara Student'] })

    const tutor = await getMyWork(actor(TUTOR), '2026-08')
    expect(tutor?.ledger.map((r) => r.sessionId)).toEqual(['taught'])
    expect(tutor?.ledger[0]).toMatchObject({ role: 'taught', subjectName: 'Maths', studentNames: [] })
  })

  it('has a ledger that adds up to the totals beside it', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([
      session('a', { minutes: 60 }),
      session('b', { kind: 'demo', minutes: 30 }),
    ] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([])
    const out = await getMyWork(actor(TUTOR), '2026-08')
    const summed = out!.ledger.reduce((n, r) => n + r.minutes, 0)
    expect(summed).toBe(out!.hours.minutes.regular + out!.hours.minutes.demo + out!.hours.minutes.exam)
  })

  it('still answers getMyHoursWorked with the totals alone', async () => {
    vi.mocked(selectSessionsWorkedByPersonInRange).mockResolvedValue([session('a')] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([])
    expect((await getMyHoursWorked(actor(TUTOR), '2026-08'))?.minutes.regular).toBe(60)
  })
})

describe('getMenteesHoursReceived - a mentor`s roll-up', () => {
  beforeEach(() => {
    vi.mocked(isMentoringOversight).mockResolvedValue(false)
    vi.mocked(mentoringScopeClassIds).mockResolvedValue(['class-1', 'class-2'])
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue([SARA, 'student-sam'])
    vi.mocked(getProfileLabelsByIds).mockResolvedValue(
      new Map([
        [SARA, { name: 'Sara Student', role: 'student' }],
        ['student-sam', { name: 'Sam Student', role: 'student' }],
      ]),
    )
  })

  it('gives one row per mentee, a mentee with no sessions included, sorted by name', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([session('s1')] as never)
    vi.mocked(selectAttendedForSessions).mockResolvedValue([{ session_id: 's1', student_id: SARA }])
    const rows = await getMenteesHoursReceived(actor('mentor-1'), '2026-08')
    expect(rows.map((r) => r.studentName)).toEqual(['Sam Student', 'Sara Student'])
    expect(rows[0].total).toEqual({ regular: 0, demo: 0, exam: 0 })
    expect(rows[1].total).toEqual({ regular: 60, demo: 0, exam: 0 })
  })

  it('reads only the classes the mentor has authority over', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])
    await getMenteesHoursReceived(actor('mentor-1'), '2026-08')
    expect(selectSessionsForClassesInRange).toHaveBeenCalledWith(
      ['class-1', 'class-2'],
      expect.any(String),
      expect.any(String),
    )
  })

  it('gives an oversight reader nothing - they read the whole academy on Class hours', async () => {
    vi.mocked(isMentoringOversight).mockResolvedValue(true)
    expect(await getMenteesHoursReceived(actor('admin-1'), '2026-08')).toEqual([])
    expect(mentoringScopeClassIds).not.toHaveBeenCalled()
  })

  it('gives a mentor with no mentee classes nothing, and reads no sessions', async () => {
    vi.mocked(mentoringScopeClassIds).mockResolvedValue([])
    expect(await getMenteesHoursReceived(actor('mentor-1'), '2026-08')).toEqual([])
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })
})
