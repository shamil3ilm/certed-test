import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ canManageClass: vi.fn(), mentorAuthorityClassIds: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectActiveClassIds: vi.fn(),
  selectActiveClassIdsAmong: vi.fn(),
  selectClassesByIds: vi.fn(),
}))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentRefsByClassIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectSession: vi.fn(),
  selectSessionAsService: vi.fn(),
  selectSessionsForClassesAsService: vi.fn(),
  selectTutorOverlappingSessions: vi.fn(),
  updateSessionActualTimesAsService: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({
  selectJoinRowsForClassesAsService: vi.fn(),
  updateJoinAtAsService: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass, mentorAuthorityClassIds } from '@/lib/permission/class'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectActiveClassIdsAmong, selectClassesByIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSessionAsService,
  selectSessionsForClassesAsService,
  selectTutorOverlappingSessions,
  updateSessionActualTimesAsService,
} from '@/lib/data/class-sessions'
import { selectJoinRowsForClassesAsService } from '@/lib/data/attendance'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { listMenteeSessionTimings, updateSessionTimes } from '@/lib/services/mentor-session-timings'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'm1' } as never
const base = { classId: 'c1', sessionDate: '2026-08-05' }
const START = '2026-08-05T10:00:00.000Z'
const END = '2026-08-05T11:30:00.000Z'
const existing = { tutor_id: 't1', actual_start: START, actual_end: END, updated_at: 'v1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(selectSessionAsService).mockResolvedValue(existing as never)
  vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([])
  vi.mocked(updateSessionActualTimesAsService).mockResolvedValue(true)
})

describe('updateSessionTimes', () => {
  it('rejects a caller who cannot manage the class, without reading or writing', async () => {
    vi.mocked(canManageClass).mockResolvedValue(false)
    await expect(updateSessionTimes(actor, { ...base, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      PermissionError,
    )
    expect(selectSessionAsService).not.toHaveBeenCalled()
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('NotFound when no session row exists for the date', async () => {
    vi.mocked(selectSessionAsService).mockResolvedValue(null)
    await expect(updateSessionTimes(actor, { ...base, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('rejects an end before the start (rolled span exceeds the overnight bound)', async () => {
    await expect(
      updateSessionTimes(actor, { ...base, startAt: '2026-08-05T10:00:00.000Z', endAt: '2026-08-05T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('rejects an end with no start', async () => {
    await expect(updateSessionTimes(actor, { ...base, startAt: null, endAt: END })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('rejects a window longer than 24 hours', async () => {
    await expect(
      updateSessionTimes(actor, { ...base, startAt: START, endAt: '2026-08-06T11:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rolls a cross-midnight end to the next day (23:30 -> 00:30)', async () => {
    await updateSessionTimes(actor, {
      ...base,
      startAt: '2026-08-05T23:30:00.000Z',
      endAt: '2026-08-05T00:30:00.000Z', // reads as before start; rolled +24h
    })
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith(
      'c1',
      '2026-08-05',
      '2026-08-05T23:30:00.000Z',
      '2026-08-06T00:30:00.000Z', // rolled to next day
      'v1',
    )
  })

  it('rejects a tutor double-booking (overlapping session in another class)', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([{ class_id: 'c2', session_date: '2026-08-05' }])
    await expect(updateSessionTimes(actor, { ...base, startAt: START, endAt: END })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(updateSessionActualTimesAsService).not.toHaveBeenCalled()
  })

  it('ignores the session being edited when checking overlap', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([{ class_id: 'c1', session_date: '2026-08-05' }])
    await updateSessionTimes(actor, { ...base, startAt: START, endAt: END })
    expect(updateSessionActualTimesAsService).toHaveBeenCalled()
  })

  it('rejects a stale edit when the row changed underneath (optimistic lock)', async () => {
    vi.mocked(updateSessionActualTimesAsService).mockResolvedValue(false)
    await expect(
      updateSessionTimes(actor, { ...base, startAt: START, endAt: END, expectedUpdatedAt: 'v0' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('writes with the loaded updated_at and records before/after in the audit', async () => {
    await updateSessionTimes(actor, {
      ...base,
      startAt: START,
      endAt: '2026-08-05T12:00:00.000Z',
      expectedUpdatedAt: 'v1',
    })
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith(
      'c1',
      '2026-08-05',
      START,
      '2026-08-05T12:00:00.000Z',
      'v1',
    )
    expect(auditPrivilegedAction).toHaveBeenCalledWith(
      actor,
      'attendance.session_times',
      'class_session',
      'c1|2026-08-05',
      {
        before: { actual_start: START, actual_end: END },
        after: { actual_start: START, actual_end: '2026-08-05T12:00:00.000Z' },
      },
    )
  })

  it('allows clearing both times (null window), skipping the overlap check', async () => {
    await updateSessionTimes(actor, { ...base, startAt: null, endAt: null })
    expect(selectTutorOverlappingSessions).not.toHaveBeenCalled()
    expect(updateSessionActualTimesAsService).toHaveBeenCalledWith('c1', '2026-08-05', null, null, 'v1')
  })
})

describe('listMenteeSessionTimings', () => {
  beforeEach(() => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    vi.mocked(mentorAuthorityClassIds).mockResolvedValue(new Set(['c1']))
    vi.mocked(selectActiveClassIdsAmong).mockResolvedValue(['c1'])
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
    vi.mocked(selectActiveClassIdsAmong).mockResolvedValue([])
    expect(await listMenteeSessionTimings(actor)).toEqual([])
  })
})
