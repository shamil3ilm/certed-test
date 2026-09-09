import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/attendance', () => ({
  listAttendanceForClassDate: vi.fn(),
  listAttendanceForStudentPage: vi.fn(),
  listAttendanceHistoryPageForClass: vi.fn(),
  summarizeAttendanceForStudent: vi.fn(),
  listManagerSessionsForDate: vi.fn(),
  listSessionsByIds: vi.fn(),
}))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudents: vi.fn(async () => []) }))
vi.mock('@/lib/data/classes', () => ({
  selectClassesByIds: vi.fn(async () => []),
  selectClassById: vi.fn(async () => ({ id: 'class-1', subject_id: null })),
}))
vi.mock('@/lib/data/subjects', () => ({
  selectSubjectsByIds: vi.fn(async () => []),
  selectActiveSubjects: vi.fn(async () => []),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/time/format', () => ({ isCalendarDate: vi.fn(), todayInZone: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn(async () => 'Asia/Kolkata') }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { canManageClass } from '@/lib/permission'
import {
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listAttendanceHistoryPageForClass,
  summarizeAttendanceForStudent,
  listManagerSessionsForDate,
  listSessionsByIds,
} from '@/lib/services/attendance'
import {
  loadClassAttendancePageData,
  attendanceRecordPageUrl,
  attendanceSessionDate,
} from '@/lib/services/page-data/class-attendance'
import { getClassMembers } from '@/lib/services/classes'
import { selectActiveClassIdsForStudents } from '@/lib/data/class-membership'
import { selectClassesByIds, selectClassById } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { getProfileNamesByIds } from '@/lib/services/users'
import { isCalendarDate, todayInZone } from '@/lib/time/format'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    if (profileId === 'student-1') {
      return {
        personas: [],
        isAdmin: false,
        isSubAdmin: false,
        isManager: false,
        isStudent: true,
        isMentor: false,
      } as any
    }
    return {
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isManager: true,
      isStudent: false,
      isMentor: false,
    } as any
  })
  vi.mocked(canManageClass).mockImplementation(async (profile: { id: string }) => profile.id !== 'student-1')
  vi.mocked(listManagerSessionsForDate).mockResolvedValue([])
  vi.mocked(listSessionsByIds).mockResolvedValue([])
  vi.mocked(listAttendanceHistoryPageForClass).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map())
})

describe('attendanceRecordPageUrl', () => {
  it('omits the default page from the record URL', () => {
    expect(attendanceRecordPageUrl(1)).toBe('?')
    expect(attendanceRecordPageUrl(2)).toBe('?recPage=2')
  })
})

describe('attendanceSessionDate', () => {
  it('falls back to the institute-local date when the candidate is invalid', () => {
    vi.mocked(isCalendarDate).mockReturnValueOnce(false as any)
    vi.mocked(todayInZone).mockReturnValueOnce('2026-07-16' as any)
    expect(attendanceSessionDate('2026-02-30', 'Asia/Kolkata')).toBe('2026-07-16')
  })
})

describe('loadClassAttendancePageData', () => {
  it('loads the student attendance view model with paging', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'student', status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation(() => false)
    vi.mocked(summarizeAttendanceForStudent).mockResolvedValueOnce({
      present: 5,
      late: 1,
      absent: 2,
      total: 8,
      rate: 75,
    } as any)
    vi.mocked(listAttendanceForStudentPage).mockResolvedValueOnce({
      items: [{ id: 'a1', session_date: '2026-07-15', status: 'present' }],
      total: 21,
    } as any)

    await expect(
      loadClassAttendancePageData({ id: 'student-1', role: 'student' } as any, 'class-1', { recPage: '2' }),
    ).resolves.toEqual({
      kind: 'student',
      recPage: 2,
      recTotal: 21,
      recTotalPages: 2,
      summary: { present: 5, late: 1, absent: 2, total: 8, rate: 75 },
      rows: [{ id: 'a1', session_date: '2026-07-15', status: 'present' }],
      sessions: [],
    })
  })

  /** Sets up a manager-view load with one session, so a test only states what it varies. */
  function managerFixture(session: Record<string, unknown>) {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'tutor', status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    // Faithful rather than a constant: a blanket `true` leaks into later tests through
    // clearAllMocks (which clears calls, not implementations) and silently makes an absent
    // aFrom/aTo look like a valid date.
    vi.mocked(isCalendarDate).mockImplementation(((v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) as any)
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      students: [
        { id: 's1', name: 'Sara Student' },
        { id: 's2', name: 'Sam Student' },
      ],
    } as any)
    vi.mocked(listManagerSessionsForDate).mockResolvedValueOnce([session] as any)
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([] as any)
    vi.mocked(listAttendanceHistoryPageForClass).mockResolvedValueOnce({ items: [], total: 0 } as any)
  }

  it("names a session by its OWN subject, not the class's current one", async () => {
    // 0104 stamps subject_id onto the session when it is recorded, so re-pointing the class
    // later must not relabel the history. The view therefore resolves the SESSION's id.
    managerFixture({ id: 'ses1', class_id: 'class-1', session_date: '2026-07-16', subject_id: 'sub-1' })
    vi.mocked(selectSubjectsByIds).mockResolvedValueOnce([{ id: 'sub-1', name: 'Physics' }] as any)

    const data = await loadClassAttendancePageData({ id: 'tutor-1' } as any, 'class-1', { date: '2026-07-16' })

    expect(data.kind).toBe('manager')
    expect((data as any).subjectNames.get('sub-1')).toBe('Physics')
    // Asked for exactly the subject the session references - not every subject in the academy.
    expect(vi.mocked(selectSubjectsByIds).mock.calls[0][0]).toEqual(['sub-1'])
  })

  it('names the subject a NEW session would be recorded as', async () => {
    // The blank form has no session to read a subject off, so it reads the CLASS's current
    // one - that is what the trigger and the write will stamp. Without this the tutor picks
    // between "the Physics hour" and "the Maths hour" with nothing on screen to tell them
    // which class they are on.
    managerFixture({ id: 'ses1', class_id: 'class-1', session_date: '2026-07-16', subject_id: null })
    vi.mocked(selectClassById).mockResolvedValue({ id: 'class-1', subject_id: 'sub-1' } as never)
    vi.mocked(selectSubjectsByIds).mockResolvedValueOnce([{ id: 'sub-1', name: 'Physics' }] as never)

    const data = await loadClassAttendancePageData({ id: 'tutor-1' } as never, 'class-1', { date: '2026-07-16' })

    expect((data as { classSubjectName: string | null }).classSubjectName).toBe('Physics')
    // Resolved in the SAME lookup as the sessions' subjects, not a second round trip.
    expect(vi.mocked(selectSubjectsByIds)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(selectSubjectsByIds).mock.calls[0][0]).toContain('sub-1')
  })

  it('reports NO subject for a legacy class, so the page can warn before anything is recorded', async () => {
    // A class with no subject stamps NULL onto every session it records, permanently - the
    // rows are then absent from the subject filter and the by-subject hours breakdown, with
    // no screen able to repair them. Null here is what lets the form say so up front.
    managerFixture({ id: 'ses1', class_id: 'class-1', session_date: '2026-07-16', subject_id: null })
    vi.mocked(selectClassById).mockResolvedValue({ id: 'class-1', subject_id: null } as never)

    const data = await loadClassAttendancePageData({ id: 'tutor-1' } as never, 'class-1', { date: '2026-07-16' })

    expect((data as { classSubjectName: string | null }).classSubjectName).toBeNull()
  })

  it('offers only the OTHER classes of these students that the actor may also manage', async () => {
    // The switcher exists because a session belongs to its class: recording the Physics hour
    // means navigating to Physics. Offering a class the target page would then refuse is the
    // one-gate rule the class list already learned, so each candidate goes through
    // canManageClass - the same gate the destination applies.
    managerFixture({ id: 'ses1', class_id: 'class-1', session_date: '2026-07-16', subject_id: null })
    vi.mocked(selectActiveClassIdsForStudents).mockResolvedValueOnce([
      'class-1', // the class being viewed
      'class-2', // active + manageable -> the only offer
      'class-3', // archived
      'class-4', // active but not manageable by this actor
    ])
    vi.mocked(selectClassesByIds).mockResolvedValueOnce([
      { id: 'class-2', name: 'Physics', status: 'active' },
      { id: 'class-3', name: 'Retired Maths', status: 'archived' },
      { id: 'class-4', name: 'Someone Else', status: 'active' },
    ] as any)
    vi.mocked(canManageClass).mockImplementation(async (_me: any, id: string) => id !== 'class-4')

    const data = await loadClassAttendancePageData({ id: 'tutor-1' } as any, 'class-1', { date: '2026-07-16' })

    expect((data as any).switchableClasses).toEqual([{ id: 'class-2', name: 'Physics' }])
    // The class in front of the reader is never offered as somewhere to switch to.
    expect(vi.mocked(selectClassesByIds).mock.calls[0][0]).not.toContain('class-1')
  })

  it('loads the manager attendance view model with normalized date and roster status mapping', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'tutor', status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    vi.mocked(isCalendarDate).mockReturnValueOnce(false as any)
    vi.mocked(todayInZone).mockReturnValueOnce('2026-07-16' as any)
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      students: [
        { id: 's1', name: 'Sara Student' },
        { id: 's2', name: 'Sam Student' },
      ],
    } as any)
    // 0094: a mark belongs to a session, so the day has one and the mark names it.
    vi.mocked(listManagerSessionsForDate).mockResolvedValueOnce([
      { id: 'ses1', class_id: 'c1', session_date: '2026-07-16' },
    ] as any)
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([
      { student_id: 's1', session_id: 'ses1', status: 'late' },
    ] as any)
    vi.mocked(listAttendanceHistoryPageForClass).mockResolvedValueOnce({
      items: [{ session_date: '2026-07-16', status: 'late', student_id: 's1', join_at: null, leave_at: null }],
      total: 1,
    } as any)

    await expect(
      loadClassAttendancePageData({ id: 'tutor-1', role: 'tutor' } as any, 'class-1', { date: 'bad-date' }),
    ).resolves.toEqual({
      kind: 'manager',
      date: '2026-07-16',
      hasMarks: true,
      sessions: [{ id: 'ses1', class_id: 'c1', session_date: '2026-07-16' }],
      // No other class shares this roster, and the session carries no subject, so both
      // are empty here - the populated cases are asserted on their own below.
      switchableClasses: [],
      subjectNames: new Map(),
      classSubjectName: null,
      // Populated only when the class has no subject - this fixture's class has none, and
      // the mocked catalogue is empty.
      subjectOptions: [],
      // The session carries the marks; `roster` is the unmarked base used when a date has
      // no session yet.
      sessionRosters: [
        {
          session: { id: 'ses1', class_id: 'c1', session_date: '2026-07-16' },
          roster: [
            { id: 's1', name: 'Sara Student', status: 'late', join_at: null, leave_at: null },
            { id: 's2', name: 'Sam Student', status: null, join_at: null, leave_at: null },
          ],
        },
      ],
      roster: [
        { id: 's1', name: 'Sara Student', status: null, join_at: null, leave_at: null },
        { id: 's2', name: 'Sam Student', status: null, join_at: null, leave_at: null },
      ],
      historyFilters: { status: '', from: '', to: '' },
      hasHistoryFilters: false,
      history: [{ session_date: '2026-07-16', status: 'late', name: 'Sara Student', join_at: null, leave_at: null }],
      // The details view is paged now: it was a silent newest-200 under a heading that
      // reads as the whole record, with filters that made it look authoritative.
      historyPage: 1,
      historyTotal: 1,
      historyTotalPages: 1,
    })
  })

  it('keeps historical student names even after they are no longer in the active roster', async () => {
    vi.mocked(isCalendarDate).mockReturnValueOnce(true as any)
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      students: [{ id: 's1', name: 'Sara Student' }],
    } as any)
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([] as any)
    vi.mocked(listAttendanceHistoryPageForClass).mockResolvedValueOnce({
      items: [
        { session_date: '2026-07-16', status: 'late', student_id: 'former-student', join_at: null, leave_at: null },
      ],
      total: 1,
    } as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map([['former-student', 'Past Student']]))

    await expect(
      loadClassAttendancePageData({ id: 'tutor-1', role: 'tutor' } as any, 'class-1', { date: '2026-07-16' }),
    ).resolves.toMatchObject({
      kind: 'manager',
      history: [{ session_date: '2026-07-16', status: 'late', name: 'Past Student', join_at: null, leave_at: null }],
    })
  })
})
