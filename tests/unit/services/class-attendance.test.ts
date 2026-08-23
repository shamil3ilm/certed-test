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
  listAttendanceHistoryForClass: vi.fn(),
  summarizeAttendanceForStudent: vi.fn(),
  getManagerSession: vi.fn(),
  listRecentSessions: vi.fn(),
}))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/time/format', () => ({ isCalendarDate: vi.fn(), todayInZone: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn(async () => 'Asia/Kolkata') }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { canManageClass } from '@/lib/permission'
import {
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listAttendanceHistoryForClass,
  summarizeAttendanceForStudent,
  getManagerSession,
  listRecentSessions,
} from '@/lib/services/attendance'
import {
  loadClassAttendancePageData,
  attendanceRecordPageUrl,
  attendanceSessionDate,
} from '@/lib/services/page-data/class-attendance'
import { getClassMembers } from '@/lib/services/classes'
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
  vi.mocked(getManagerSession).mockResolvedValue(null)
  vi.mocked(listRecentSessions).mockResolvedValue([])
  vi.mocked(listAttendanceHistoryForClass).mockResolvedValue([])
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
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([{ student_id: 's1', status: 'late' }] as any)
    vi.mocked(listAttendanceHistoryForClass).mockResolvedValueOnce([
      { session_date: '2026-07-16', status: 'late', student_id: 's1', join_at: null, leave_at: null },
    ] as any)

    await expect(
      loadClassAttendancePageData({ id: 'tutor-1', role: 'tutor' } as any, 'class-1', { date: 'bad-date' }),
    ).resolves.toEqual({
      kind: 'manager',
      date: '2026-07-16',
      session: null,
      studentEntryAt: null,
      hasMarks: true,
      roster: [
        { id: 's1', name: 'Sara Student', status: 'late', join_at: null, leave_at: null },
        { id: 's2', name: 'Sam Student', status: null, join_at: null, leave_at: null },
      ],
      historyFilters: { status: '', from: '', to: '' },
      hasHistoryFilters: false,
      history: [{ session_date: '2026-07-16', status: 'late', name: 'Sara Student', join_at: null, leave_at: null }],
    })
  })

  it('keeps historical student names even after they are no longer in the active roster', async () => {
    vi.mocked(isCalendarDate).mockReturnValueOnce(true as any)
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      students: [{ id: 's1', name: 'Sara Student' }],
    } as any)
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([] as any)
    vi.mocked(listAttendanceHistoryForClass).mockResolvedValueOnce([
      { session_date: '2026-07-16', status: 'late', student_id: 'former-student', join_at: null, leave_at: null },
    ] as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValueOnce(new Map([['former-student', 'Past Student']]))

    await expect(
      loadClassAttendancePageData({ id: 'tutor-1', role: 'tutor' } as any, 'class-1', { date: '2026-07-16' }),
    ).resolves.toMatchObject({
      kind: 'manager',
      history: [{ session_date: '2026-07-16', status: 'late', name: 'Past Student', join_at: null, leave_at: null }],
    })
  })
})
