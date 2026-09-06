import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({
  canManageClass: vi.fn(),
  mentorAuthorityClassIds: vi.fn(),
  mentoringScopeClassIds: vi.fn(),
}))
vi.mock('@/lib/permission', () => ({ assertClassActive: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectActiveClassIds: vi.fn(),
  selectActiveClassIdsAmong: vi.fn(),
  selectClassesByIds: vi.fn(),
}))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentRefsByClassIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectSessionById: vi.fn(),
  selectSessionsForDate: vi.fn(),
  selectSessionByIdAsService: vi.fn(),
  selectSessionsForClassesAsService: vi.fn(),
  selectTutorOverlappingSessions: vi.fn(),
  updateSessionActualTimesAsService: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({
  selectJoinRowsForClassesAsService: vi.fn(),
  updateJoinAtAsService: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass, mentoringScopeClassIds } from '@/lib/permission/class'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSessionByIdAsService,
  selectSessionsForClassesAsService,
  selectTutorOverlappingSessions,
  updateSessionActualTimesAsService,
} from '@/lib/data/class-sessions'
import { selectJoinRowsForClassesAsService, updateJoinAtAsService } from '@/lib/data/attendance'
import { selectSessionById, selectSessionsForDate } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import {
  listMenteeSessionTimings,
  updateSessionTimes,
  updateStudentJoinTime,
} from '@/lib/services/mentor-session-timings'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'm1' } as never
const base = { classId: 'c1', sessionDate: '2026-08-05' }
// updateSessionTimes now identifies the row by its own id (a class may hold several
// sessions on one date), so its calls pass sessionId instead of class + date.
const timesBase = { sessionId: 'ses1' }
const START = '2026-08-05T10:00:00.000Z'
const END = '2026-08-05T11:30:00.000Z'
// id + class_id + session_date matter now: the service resolves the class (and so the
// authorization) from the ROW, and excludes the edited session from the overlap check by id.
const existing = {
  id: 'ses1',
  class_id: 'c1',
  session_date: '2026-08-05',
  tutor_id: 't1',
  actual_start: START,
  actual_end: END,
  updated_at: 'v1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(selectSessionByIdAsService).mockResolvedValue(existing as never)
  vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([])
  vi.mocked(updateSessionActualTimesAsService).mockResolvedValue(true)
})

describe('updateStudentJoinTime - the entry must belong to the session window', () => {
  beforeEach(() => {
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([{ student_id: 's1' }] as never)
    vi.mocked(selectSessionById).mockResolvedValue(existing as never)
    vi.mocked(selectSessionsForDate).mockResolvedValue([existing] as never)
    vi.mocked(updateJoinAtAsService).mockResolvedValue(true as never)
  })

  it('accepts an entry inside the session window', async () => {
    await updateStudentJoinTime(actor, { ...base, joinAt: '2026-08-05T10:15:00.000Z' })
    expect(updateJoinAtAsService).toHaveBeenCalled()
  })

  it('accepts an early joiner - waiting in the room just before the tutor starts', async () => {
    // The shape seen in real data: entry 22:12 against a 22:13 start. Normal, not a defect.
    await updateStudentJoinTime(actor, { ...base, joinAt: '2026-08-05T09:59:00.000Z' })
    expect(updateJoinAtAsService).toHaveBeenCalled()
  })

  it('rejects an entry implausibly before the start (a different part of the day)', async () => {
    // The corrupt shape found on staging: a 02:45 entry recorded against a 13:31 session.
    await expect(updateStudentJoinTime(actor, { ...base, joinAt: '2026-08-05T02:45:00.000Z' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(updateJoinAtAsService).not.toHaveBeenCalled()
  })

  it('still rejects an entry after the session ended', async () => {
    await expect(updateStudentJoinTime(actor, { ...base, joinAt: '2026-08-05T12:00:00.000Z' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(updateJoinAtAsService).not.toHaveBeenCalled()
  })

  it('clearing the entry (null) skips the window checks', async () => {
    await updateStudentJoinTime(actor, { ...base, joinAt: null })
    expect(updateJoinAtAsService).toHaveBeenCalledWith('ses1', 's1', null)
  })
})

describe('updateSessionTimes', () => {
  it('rejects a caller who cannot manage the session OWN class, and writes nothing', async () => {
    // The class is resolved from the loaded row rather than taken from the caller, so the
    // read necessarily happens first - what must not happen is the WRITE.
    vi.mocked(canManageClass).mockResolvedValue(false)
    await expect(updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      PermissionError,
    )
    expect(canManageClass).toHaveBeenCalledWith(actor, 'c1')
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('NotFound when no session row exists for the date', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue(null)
    await expect(updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('rejects an end before the start (rolled span exceeds the overnight bound)', async () => {
    await expect(
      updateSessionTimes(actor, {
        ...timesBase,
        startAt: '2026-08-05T10:00:00.000Z',
        endAt: '2026-08-05T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('rejects an end with no start', async () => {
    await expect(updateSessionTimes(actor, { ...timesBase, startAt: null, endAt: END })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('rejects a window longer than 24 hours', async () => {
    await expect(
      updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: '2026-08-06T11:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rolls a cross-midnight end to the next day (23:30 -> 00:30)', async () => {
    await updateSessionTimes(actor, {
      ...timesBase,
      startAt: '2026-08-05T23:30:00.000Z',
      endAt: '2026-08-05T00:30:00.000Z', // reads as before start; rolled +24h
    })
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith(
      'ses1',
      '2026-08-05T23:30:00.000Z',
      '2026-08-06T00:30:00.000Z', // rolled to next day
      'v1',
    )
  })

  it('rejects a tutor double-booking (overlapping session in another class)', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([
      { id: 'ses9', class_id: 'c2', session_date: '2026-08-05' },
    ])
    await expect(updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('ignores the session being edited when checking overlap (matched by id)', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([
      { id: 'ses1', class_id: 'c1', session_date: '2026-08-05' },
    ])
    await updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END })
    expect(updateSessionActualTimesAsService).toHaveBeenCalled()
  })

  it('still rejects an overlap with a DIFFERENT session on the same class and date', async () => {
    // The old guard excluded by (class, date), so a second session that day could overlap
    // the first unnoticed. Excluding by id keeps the real conflict visible.
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([
      { id: 'ses2', class_id: 'c1', session_date: '2026-08-05' },
    ])
    await expect(updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('rejects a stale edit when the row changed underneath (optimistic lock)', async () => {
    vi.mocked(updateSessionActualTimesAsService).mockResolvedValue(false)
    await expect(
      updateSessionTimes(actor, { ...timesBase, startAt: START, endAt: END, expectedUpdatedAt: 'v0' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('writes with the loaded updated_at and records before/after in the audit', async () => {
    await updateSessionTimes(actor, {
      ...timesBase,
      startAt: START,
      endAt: '2026-08-05T12:00:00.000Z',
      expectedUpdatedAt: 'v1',
    })
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith('ses1', START, '2026-08-05T12:00:00.000Z', 'v1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(actor, 'attendance.session_times', 'class_session', 'ses1', {
      before: { actual_start: START, actual_end: END },
      after: { actual_start: START, actual_end: '2026-08-05T12:00:00.000Z' },
    })
  })

  it('allows clearing both times (null window), skipping the overlap check', async () => {
    await updateSessionTimes(actor, { ...timesBase, startAt: null, endAt: null })
    expect(selectTutorOverlappingSessions).not.toHaveBeenCalled()
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith('ses1', null, null, 'v1')
  })
})

describe('listMenteeSessionTimings', () => {
  beforeEach(() => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    vi.mocked(mentoringScopeClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectSessionsForClassesAsService).mockResolvedValue([
      {
        class_id: 'c1',
        session_date: '2026-08-05',
        tutor_id: 't1',
        actual_start: START,
        actual_end: END,
        updated_at: 'v1',
      },
    ] as never)
    vi.mocked(selectJoinRowsForClassesAsService).mockResolvedValue([
      { class_id: 'c1', student_id: 's1', session_date: '2026-08-05', join_at: '2026-08-05T10:05:00.000Z' },
    ] as never)
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([{ class_id: 'c1', student_id: 's1' }] as never)
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c1', name: 'Maths', subject_id: 'sub1' }] as never)
    vi.mocked(selectSubjectsByIds).mockResolvedValue([{ id: 'sub1', name: 'Algebra' }] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([
        ['s1', 'Sam'],
        ['t1', 'Tara'],
      ]),
    )
  })

  it('returns one row per (class, date) unioning session + attendance, with names/subject/updatedAt', async () => {
    const rows = await listMenteeSessionTimings(actor)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      classId: 'c1',
      className: 'Maths',
      subject: 'Algebra',
      studentName: 'Sam',
      tutorName: 'Tara',
      sessionDate: '2026-08-05',
      startAt: START,
      endAt: END,
      studentEntryAt: '2026-08-05T10:05:00.000Z',
      updatedAt: 'v1',
    })
  })

  it('returns nothing when the mentor has no active authority classes', async () => {
    vi.mocked(mentoringScopeClassIds).mockResolvedValue([])
    expect(await listMenteeSessionTimings(actor)).toEqual([])
  })
})
