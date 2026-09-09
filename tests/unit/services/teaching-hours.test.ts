vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/class', () => ({
  mentorAuthorityClassIds: vi.fn(),
  mentoringScopeClassIds: vi.fn(),
  isMentoringOversight: vi.fn(),
}))
vi.mock('@/lib/data/analytics', () => ({
  selectSessionsForClassesInRange: vi.fn(),
  selectAttendedForSessions: vi.fn(),
}))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectClassesByIds: vi.fn(),
  selectActiveClassIds: vi.fn(),
  selectArchivedClassIds: vi.fn(async () => []),
  // Archived-class filter: by default pass every given id through as active.
  selectActiveClassIdsAmong: vi.fn(async (ids: string[]) => ids),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ myClassScope: vi.fn() }))

import { mentoringScopeClassIds, isMentoringOversight } from '@/lib/permission/class'
import { selectArchivedClassIds, selectActiveClassIdsAmong } from '@/lib/data/classes'
import {
  selectAttendedForSessions,
  selectSessionsForClassesInRange,
  type AttendedRow,
  type SessionHoursRow,
} from '@/lib/data/analytics'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { selectClassesByIds, selectActiveClassIds } from '@/lib/data/classes'
import { getProfileNamesByIds } from '@/lib/services/users'
import { myClassScope } from '@/lib/services/classes'
import {
  aggregateClassStudentHours,
  aggregateClassTutorHours,
  getAcademyClassHours,
  getClassTutorHours,
  getTutorPersonalHours,
  rollUpPersonHours,
  type ClassTutorHours,
} from '@/lib/services/teaching-hours'

const row = (over: Partial<SessionHoursRow>): SessionHoursRow => ({
  id: 'SESS1',
  class_id: 'C1',
  tutor_id: 'T1',
  subject_id: null,
  actual_start: '2026-08-02T10:00:00.000Z',
  actual_end: '2026-08-02T11:30:00.000Z',
  ...over,
})

const actor = { id: 'M1' } as never

// Academy-wide hours are capability-gated in the service now; the authorization module
// is mocked below, so this is just the actor the guard is called with.
const ACTOR = 'admin-1'

describe('aggregateClassTutorHours (pure)', () => {
  it('groups by (class, tutor) and sums minutes', () => {
    const groups = aggregateClassTutorHours([
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T10:00:00.000Z',
        actual_end: '2026-08-02T11:30:00.000Z',
      }), // 90
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-03T10:00:00.000Z',
        actual_end: '2026-08-03T11:00:00.000Z',
      }), // 60
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ classId: 'C1', tutorId: 'T1', minutes: 150, sessionCount: 2 })
  })

  it('accumulates SEVERAL sessions on the SAME DAY (the reported bug)', () => {
    // Recording three sessions for one class on one date used to overwrite the previous
    // row, so the month showed only the last one's duration. Each is now its own record
    // and the total is their sum.
    const groups = aggregateClassTutorHours([
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T09:00:00.000Z',
        actual_end: '2026-08-02T10:00:00.000Z',
      }), // 60
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T11:00:00.000Z',
        actual_end: '2026-08-02T12:00:00.000Z',
      }), // 60
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T14:00:00.000Z',
        actual_end: '2026-08-02T15:30:00.000Z',
      }), // 90
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ minutes: 210, sessionCount: 3 })
  })

  it('never mixes two tutors, even on the same class and day', () => {
    const groups = aggregateClassTutorHours([
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T09:00:00.000Z',
        actual_end: '2026-08-02T10:00:00.000Z',
      }), // T1: 60
      row({
        class_id: 'C1',
        tutor_id: 'T2',
        actual_start: '2026-08-02T11:00:00.000Z',
        actual_end: '2026-08-02T13:00:00.000Z',
      }), // T2: 120
    ])
    const byTutor = Object.fromEntries(groups.map((g) => [g.tutorId, g.minutes]))
    expect(byTutor).toEqual({ T1: 60, T2: 120 })
  })

  it('keeps a null tutor in its own "unassigned" bucket, separate from a named tutor', () => {
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', tutor_id: 'T1', actual_end: '2026-08-02T11:00:00.000Z' }), // 60
      row({ class_id: 'C1', tutor_id: null, actual_end: '2026-08-02T10:30:00.000Z' }), // 30
    ])
    expect(groups).toHaveLength(2)
    const named = groups.find((g) => g.tutorId === 'T1')
    const unassigned = groups.find((g) => g.tutorId === null)
    expect(named?.minutes).toBe(60)
    expect(unassigned?.minutes).toBe(30)
  })

  it('treats a missing end as zero minutes (never negative)', () => {
    const groups = aggregateClassTutorHours([row({ class_id: 'C1', tutor_id: 'T1', actual_end: null })])
    expect(groups[0].minutes).toBe(0)
    expect(groups[0].sessionCount).toBe(1)
  })
})

describe('getClassTutorHours (mentor scope isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'C1', name: 'Maths' }] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['T1', 'Tutor One']]))
    // An explicit default. Left undefined it merely READ as false, so the oversight branch
    // was untested and any test that set it leaked into the next.
    vi.mocked(isMentoringOversight).mockResolvedValue(false)
  })

  it('an OVERSIGHT reader scopes by excluding archived classes, not by listing every active one', async () => {
    // The mentor branch travels as their own (bounded) class ids; an oversight reader is
    // academy-wide, and an inclusion list there is one uuid per class in a GET URL. This is
    // the same split /session-timings makes, and the reason getClassTutorHours stopped
    // asking mentoringScopeClassIds for an oversight caller at all.
    vi.mocked(isMentoringOversight).mockResolvedValue(true)
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['archived-1'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])

    await getClassTutorHours(actor, '2026-08')

    const [classIds, , , excluded] = vi.mocked(selectSessionsForClassesInRange).mock.calls[0]
    expect(classIds, 'an inclusion list would grow with the academy').toBeNull()
    expect(excluded).toEqual(['archived-1'])
    expect(mentoringScopeClassIds).not.toHaveBeenCalled()
  })

  it('queries ONLY the mentor-authority classes - a tutor other classes never enter the query', async () => {
    // Mentor M1 has authority over C1 only (their mentee is enrolled there).
    vi.mocked(mentoringScopeClassIds).mockResolvedValue(['C1'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'T1', actual_end: '2026-08-02T11:30:00.000Z' }), // 90
    ])

    const result = await getClassTutorHours(actor, '2026-08')

    // The class-id list passed to the data layer is EXACTLY the authority set - not C2.
    const passedClassIds = vi.mocked(selectSessionsForClassesInRange).mock.calls[0][0]
    expect(passedClassIds).toEqual(['C1'])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ classId: 'C1', className: 'Maths', totalMinutes: 90 })
    expect(result[0].tutors[0]).toMatchObject({ tutorId: 'T1', tutorName: 'Tutor One', minutes: 90 })
  })

  it('returns nothing (and never queries sessions) when the mentor has no authority classes', async () => {
    vi.mocked(mentoringScopeClassIds).mockResolvedValue([])
    const result = await getClassTutorHours(actor, '2026-08')
    expect(result).toEqual([])
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })
})

describe('getTutorPersonalHours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
  })

  it("sums only the tutor's OWN sessions - a co-teacher's are excluded", async () => {
    vi.mocked(myClassScope).mockResolvedValue(['C1', 'C2'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'M1', actual_end: '2026-08-02T11:30:00.000Z' }), // 90 - mine
      row({ class_id: 'C2', tutor_id: 'M1', actual_end: '2026-08-02T10:30:00.000Z' }), // 30 - mine
      row({ class_id: 'C1', tutor_id: 'OTHER', actual_end: '2026-08-02T12:00:00.000Z' }), // co-teacher - excluded
    ])
    const result = await getTutorPersonalHours(actor, '2026-08')
    expect(result).toEqual({ month: '2026-08', minutes: 120, sessionCount: 2 })
  })

  it('is zero with no classes and never queries', async () => {
    vi.mocked(myClassScope).mockResolvedValue([])
    const result = await getTutorPersonalHours(actor, '2026-08')
    expect(result).toEqual({ month: '2026-08', minutes: 0, sessionCount: 0 })
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })

  it('an academy-wide reader who also teaches reads with NO class predicate, minus archived', async () => {
    // The tile is reachable by someone holding an academy-wide persona alongside tutor, and
    // their class list is the whole academy - one uuid per class in the GET URL. Null says
    // "no class predicate", and Q7's active-only rule is then spelled as the exclusion that
    // shrinks rather than the inclusion that grows. An empty scope ([]) must NOT take this
    // path: that reader has no classes, not all of them.
    vi.mocked(myClassScope).mockResolvedValue(null)
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['ARCHIVED1'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'M1', actual_end: '2026-08-02T11:30:00.000Z' }),
    ])

    const result = await getTutorPersonalHours(actor, '2026-08')

    expect(result.minutes).toBe(90)
    const [classIds, , , excluded] = vi.mocked(selectSessionsForClassesInRange).mock.calls[0]
    expect(classIds, 'the academy must not travel as a uuid list').toBeNull()
    expect(excluded).toEqual(['ARCHIVED1'])
    expect(selectActiveClassIdsAmong, 'nothing to trim when there is no list').not.toHaveBeenCalled()
  })
})

const mark = (over: Partial<AttendedRow>): AttendedRow => ({
  session_id: 'SESS1',
  student_id: 'S1',
  ...over,
})

const tutorClass = (over: Partial<ClassTutorHours>): ClassTutorHours => ({
  classId: 'C1',
  className: 'Class 1',
  subjectName: null,
  totalMinutes: 90,
  tutors: [{ tutorId: 'T1', tutorName: 'Tara', minutes: 90, sessionCount: 1 }],
  ...over,
})

describe('rollUpPersonHours (pure)', () => {
  it('sums one tutor across several classes into a single row', () => {
    const totals = rollUpPersonHours([
      tutorClass({
        classId: 'C1',
        tutors: [{ tutorId: 'T1', tutorName: 'Tara', minutes: 90, sessionCount: 2 }],
      }),
      tutorClass({
        classId: 'C2',
        tutors: [{ tutorId: 'T1', tutorName: 'Tara', minutes: 30, sessionCount: 1 }],
      }),
    ])
    expect(totals).toEqual([{ personId: 'T1', personName: 'Tara', minutes: 120, sessionCount: 3, classCount: 2 }])
  })

  it('keeps distinct tutors apart and sorts by minutes desc', () => {
    const totals = rollUpPersonHours([
      tutorClass({
        tutors: [
          { tutorId: 'T1', tutorName: 'Tara', minutes: 30, sessionCount: 1 },
          { tutorId: 'T2', tutorName: 'Mo', minutes: 120, sessionCount: 2 },
        ],
      }),
    ])
    expect(totals.map((t) => [t.personName, t.minutes])).toEqual([
      ['Mo', 120],
      ['Tara', 30],
    ])
  })

  it('keeps the unassigned bucket as its own row rather than merging it into a tutor', () => {
    const totals = rollUpPersonHours([
      tutorClass({
        tutors: [
          { tutorId: null, tutorName: 'Unassigned', minutes: 60, sessionCount: 1 },
          { tutorId: 'T1', tutorName: 'Tara', minutes: 60, sessionCount: 1 },
        ],
      }),
    ])
    expect(totals).toHaveLength(2)
    expect(totals.find((t) => t.personId === null)?.minutes).toBe(60)
  })
})

describe('aggregateClassStudentHours (pure)', () => {
  it("credits an attending student with that day's recorded session window", () => {
    const groups = aggregateClassStudentHours([row({})], [mark({})])
    expect(groups).toEqual([{ classId: 'C1', subjectId: null, studentId: 'S1', minutes: 90, sessionCount: 1 }])
  })

  it('credits ONLY the sessions the student was marked for (0094, per session)', () => {
    const groups = aggregateClassStudentHours(
      [
        row({ id: 'MORNING' }),
        row({ id: 'AFTERNOON', actual_start: '2026-08-02T14:00:00.000Z', actual_end: '2026-08-02T15:00:00.000Z' }),
      ],
      // Present in the morning, absent in the afternoon (an absent mark never reaches here).
      [mark({ session_id: 'MORNING' })],
    )
    expect(groups[0]).toMatchObject({ minutes: 90, sessionCount: 1 })
  })

  it('sums both sessions of a day when the student attended both', () => {
    const groups = aggregateClassStudentHours(
      [
        row({ id: 'MORNING' }),
        row({ id: 'AFTERNOON', actual_start: '2026-08-02T14:00:00.000Z', actual_end: '2026-08-02T15:00:00.000Z' }),
      ],
      [mark({ session_id: 'MORNING' }), mark({ session_id: 'AFTERNOON' })],
    )
    expect(groups[0]).toMatchObject({ minutes: 150, sessionCount: 2 })
  })

  it('gives each attending student the same day independently', () => {
    const groups = aggregateClassStudentHours([row({})], [mark({}), mark({ student_id: 'S2' })])
    expect(groups.map((g) => [g.studentId, g.minutes])).toEqual([
      ['S1', 90],
      ['S2', 90],
    ])
  })

  it("never credits one class's hours to a student attending another", () => {
    const groups = aggregateClassStudentHours(
      [row({ id: 'S-C1', class_id: 'C1' }), row({ id: 'S-C2', class_id: 'C2' })],
      [mark({ session_id: 'S-C1', student_id: 'S1' })],
    )
    expect(groups).toEqual([{ classId: 'C1', subjectId: null, studentId: 'S1', minutes: 90, sessionCount: 1 }])
  })

  it('contributes nothing for a mark whose session is outside the window', () => {
    const groups = aggregateClassStudentHours([row({})], [mark({ session_id: 'NOT-IN-WINDOW' })])
    expect(groups).toEqual([])
  })

  it('counts a session with no recorded end as attended but worth 0 minutes', () => {
    const groups = aggregateClassStudentHours([row({ actual_end: null })], [mark({})])
    expect(groups).toEqual([{ classId: 'C1', subjectId: null, studentId: 'S1', minutes: 0, sessionCount: 1 }])
  })

  it('is empty when nobody attended', () => {
    expect(aggregateClassStudentHours([row({})], [])).toEqual([])
  })
})

describe('getAcademyClassHours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
    vi.mocked(selectActiveClassIds).mockResolvedValue(['C1'])
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'C1', name: 'Class 1' }] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([
        ['T1', 'Tara'],
        ['S1', 'Sam'],
      ]),
    )
  })

  it('reports the tutor and student sides from ONE session read', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([row({})])
    vi.mocked(selectAttendedForSessions).mockResolvedValue([mark({})])

    const report = await getAcademyClassHours(ACTOR, '2026-08')

    expect(selectSessionsForClassesInRange).toHaveBeenCalledTimes(1)
    expect(report.personTotals).toEqual([
      { personId: 'T1', personName: 'Tara', minutes: 90, sessionCount: 1, classCount: 1 },
    ])
    expect(report.tutorClasses[0]).toMatchObject({ className: 'Class 1', totalMinutes: 90 })
    expect(report.studentClasses[0].students).toEqual([
      { studentId: 'S1', studentName: 'Sam', minutes: 90, sessionCount: 1 },
    ])
  })

  it('asks for attendance on exactly the sessions it fetched', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ id: 'S1' }),
      row({ id: 'S2' }),
      row({ id: 'S3' }),
    ])
    vi.mocked(selectAttendedForSessions).mockResolvedValue([])

    await getAcademyClassHours(ACTOR, '2026-08')

    expect(selectAttendedForSessions).toHaveBeenCalledWith(['S1', 'S2', 'S3'])
  })

  it('skips the attendance read entirely when the month has no sessions', async () => {
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])

    const report = await getAcademyClassHours(ACTOR, '2026-08')

    expect(selectAttendedForSessions).not.toHaveBeenCalled()
    expect(report).toEqual({ personTotals: [], tutorClasses: [], studentClasses: [] })
  })

  it('returns an empty report when the month has no sessions', async () => {
    // Asserts the OUTCOME, not "no active classes -> no session query". The academy-wide
    // scope is expressed by EXCLUDING archived classes rather than by listing active ones,
    // so there is no active-class count to short-circuit on - and asking for one purely to
    // skip a query would reintroduce an academy-sized id list.
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])

    const report = await getAcademyClassHours(ACTOR, '2026-08')

    expect(report).toEqual({ personTotals: [], tutorClasses: [], studentClasses: [] })
    // The attendance read is still skipped - that short-circuit is real and still holds.
    expect(selectAttendedForSessions).not.toHaveBeenCalled()
  })

  it('scopes the academy report by EXCLUDING archived classes, not by listing active ones', async () => {
    // One uuid per active class in a GET URL grows with the academy; the archived set is
    // the same Q7 rule from the side that shrinks.
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['archived-1'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([])

    await getAcademyClassHours(ACTOR, '2026-08')

    const [classIds, , , excluded] = vi.mocked(selectSessionsForClassesInRange).mock.calls[0]
    expect(classIds, 'an inclusion list would grow with the academy').toBeNull()
    expect(excluded).toEqual(['archived-1'])
  })
})

/**
 * A fee line is labelled by what was taught, so the subject is part of the grouping key.
 * Grouping by class alone forced ONE label onto a class whose month mixed two subjects, and
 * the only safe label then was the class name - which is how a level ("C12") came to print
 * in a column headed Subject. Split by subject, each line names its own, and the minutes
 * still add up to the same class total.
 */
describe('hours are grouped by subject, not just by class', () => {
  it('splits one class into a group per subject', () => {
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T1' }),
      row({ class_id: 'C1', subject_id: 'sub-physics', tutor_id: 'T1' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.subjectId).sort()).toEqual(['sub-maths', 'sub-physics'])
  })

  it('keeps sessions of the SAME subject together', () => {
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T1' }),
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T1' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].sessionCount).toBe(2)
  })

  it('gives a session with no subject its own bucket rather than folding it into one', () => {
    // Pre-0104 sessions carry null. Merging them into a named subject would attribute hours
    // to a subject nothing recorded.
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T1' }),
      row({ class_id: 'C1', subject_id: null, tutor_id: 'T1' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.some((g) => g.subjectId === null)).toBe(true)
  })

  it('still separates tutors within one subject', () => {
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T1' }),
      row({ class_id: 'C1', subject_id: 'sub-maths', tutor_id: 'T2' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.tutorId).sort()).toEqual(['T1', 'T2'])
  })
})
