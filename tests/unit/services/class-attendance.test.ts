import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/attendance', () => ({
  listAttendanceForClassDate: vi.fn(),
  listAttendanceForStudentPage: vi.fn(),
  listSessionSummariesForClass: vi.fn(),
  summarizeAttendanceForStudent: vi.fn(),
}))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/time/format', () => ({ isCalendarDate: vi.fn(), todayInDisplayZone: vi.fn() }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import {
  listAttendanceForClassDate,
  listAttendanceForStudentPage,
  listSessionSummariesForClass,
  summarizeAttendanceForStudent,
} from '@/lib/services/attendance'
import {
  loadClassAttendancePageData,
  attendanceRecordPageUrl,
  attendanceSessionDate,
} from '@/lib/services/page-data/class-attendance'
import { getClassMembers } from '@/lib/services/classes'
import { isCalendarDate, todayInDisplayZone } from '@/lib/time/format'

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
    vi.mocked(todayInDisplayZone).mockReturnValueOnce('2026-07-16' as any)
    expect(attendanceSessionDate('2026-02-30')).toBe('2026-07-16')
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
    })
  })

  it('loads the manager attendance view model with normalized date and roster status mapping', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'tutor', status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    vi.mocked(isCalendarDate).mockReturnValueOnce(false as any)
    vi.mocked(todayInDisplayZone).mockReturnValueOnce('2026-07-16' as any)
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      students: [
        { id: 's1', name: 'Sara Student' },
        { id: 's2', name: 'Sam Student' },
      ],
    } as any)
    vi.mocked(listAttendanceForClassDate).mockResolvedValueOnce([{ student_id: 's1', status: 'late' }] as any)
    vi.mocked(listSessionSummariesForClass).mockResolvedValueOnce([
      { session_date: '2026-07-16', present: 0, late: 1, absent: 0, total: 1, rate: 100 },
    ] as any)

    await expect(
      loadClassAttendancePageData({ id: 'tutor-1', role: 'tutor' } as any, 'class-1', { date: 'bad-date' }),
    ).resolves.toEqual({
      kind: 'manager',
      date: '2026-07-16',
      roster: [
        { id: 's1', name: 'Sara Student', status: 'late' },
        { id: 's2', name: 'Sam Student', status: null },
      ],
      sessions: [{ session_date: '2026-07-16', present: 0, late: 1, absent: 0, total: 1, rate: 100 }],
    })
  })
})
