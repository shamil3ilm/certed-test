import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({
  canManageClass: vi.fn(),
  mentorAuthorityClassIds: vi.fn(),
  mentoringScopeClassIds: vi.fn(),
  isMentoringOversight: vi.fn(),
}))
vi.mock('@/lib/permission', () => ({ assertClassActive: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectActiveClassIds: vi.fn(),
  selectActiveClassIdsAmong: vi.fn(),
  selectClassesByIds: vi.fn(),
  selectArchivedClassIds: vi.fn(),
}))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentRefsByClassIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectSessionById: vi.fn(),
  selectSessionsForDate: vi.fn(),
  selectSessionByIdAsService: vi.fn(),
  selectSessionPage: vi.fn(),
  selectTutorOverlappingSessions: vi.fn(),
  updateSessionActualTimesAsService: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({
  selectJoinRowsForSessionsAsService: vi.fn(),
  updateJoinAtAsService: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass, mentoringScopeClassIds, isMentoringOversight } from '@/lib/permission/class'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { selectClassesByIds, selectArchivedClassIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import {
  selectSessionByIdAsService,
  selectSessionPage,
  selectTutorOverlappingSessions,
  updateSessionActualTimesAsService,
} from '@/lib/data/class-sessions'
import { selectJoinRowsForSessionsAsService, updateJoinAtAsService } from '@/lib/data/attendance'
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
const JOIN = '2026-08-05T10:05:00.000Z'
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
  const PAGE = { page: 1, pageSize: 20 }

  beforeEach(() => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as never)
    vi.mocked(isMentoringOversight).mockResolvedValue(false)
    vi.mocked(mentoringScopeClassIds).mockResolvedValue(['c1'])
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['arch1'])
    vi.mocked(selectSessionPage).mockResolvedValue({
      items: [
        {
          id: 'ses1',
          class_id: 'c1',
          session_date: '2026-08-05',
          tutor_id: 't1',
          subject_id: 'sub1',
          actual_start: START,
          actual_end: END,
          updated_at: 'v1',
        },
      ],
      total: 137,
    } as never)
    vi.mocked(selectJoinRowsForSessionsAsService).mockResolvedValue([
      { class_id: 'c1', session_id: 'ses1', student_id: 's1', session_date: '2026-08-05', join_at: JOIN },
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

  it('returns one row per SESSION with names, subject and updatedAt attached', async () => {
    const { items } = await listMenteeSessionTimings(actor, PAGE)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      sessionId: 'ses1',
      classId: 'c1',
      className: 'Maths',
      subject: 'Algebra',
      studentName: 'Sam',
      tutorName: 'Tara',
      sessionDate: '2026-08-05',
      startAt: START,
      endAt: END,
      studentEntryAt: JOIN,
      updatedAt: 'v1',
    })
  })

  it('reports the QUERY total, not the length of the page', async () => {
    // The pager reads this. Returning items.length would cap every list at one page while
    // still looking correct on the first - the exact shape of the bug this replaced.
    await expect(listMenteeSessionTimings(actor, PAGE)).resolves.toMatchObject({ total: 137 })
  })

  it("reads the subject from the SESSION, not from the class's current subject", async () => {
    // Re-pointing a class at another subject must not relabel what past sessions taught.
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'c1', name: 'Maths', subject_id: 'sub-new' }] as never)
    const { items } = await listMenteeSessionTimings(actor, PAGE)
    expect(items[0].subject).toBe('Algebra')
    expect(vi.mocked(selectSubjectsByIds).mock.calls[0][0]).toEqual(['sub1'])
  })

  it('asks for only ONE page of rows, not the whole scope', async () => {
    await listMenteeSessionTimings(actor, { page: 3, pageSize: 20 })
    expect(selectSessionPage).toHaveBeenCalledWith(expect.anything(), { from: 40, to: 59 })
  })

  it("fetches attendance for the page's SESSIONS, never for every class in scope", async () => {
    await listMenteeSessionTimings(actor, PAGE)
    expect(selectJoinRowsForSessionsAsService).toHaveBeenCalledWith(['ses1'])
  })

  it('scopes a mentor by an inclusion list of their classes', async () => {
    await listMenteeSessionTimings(actor, PAGE)
    expect(selectSessionPage).toHaveBeenCalledWith(expect.objectContaining({ classIds: ['c1'] }), expect.anything())
  })

  it('scopes an OVERSIGHT reader by excluding archived classes, not by listing every active one', async () => {
    // Listing every active class would put one uuid per class in the URL; the exclusion is
    // the small side of the same Q7 split.
    vi.mocked(isMentoringOversight).mockResolvedValue(true)
    await listMenteeSessionTimings(actor, PAGE)
    const filter = vi.mocked(selectSessionPage).mock.calls[0][0]
    expect(filter.excludeClassIds).toEqual(['arch1'])
    expect(filter.classIds).toBeUndefined()
  })

  it('INTERSECTS a student filter with the mentor scope rather than replacing it', async () => {
    // A mentor narrowing to a student outside their mentees must see nothing, not that
    // student's sessions.
    await listMenteeSessionTimings(actor, { ...PAGE, filters: { studentClassIds: ['c9'] } })
    expect(selectSessionPage).toHaveBeenCalledWith(expect.objectContaining({ classIds: [] }), expect.anything())
  })

  it('passes the subject, tutor and date filters straight through to the query', async () => {
    await listMenteeSessionTimings(actor, {
      ...PAGE,
      filters: { subjectId: 'sub1', tutorId: 't1', from: '2026-08-01', to: '2026-08-31' },
    })
    expect(selectSessionPage).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'sub1', tutorId: 't1', from: '2026-08-01', to: '2026-08-31' }),
      expect.anything(),
    )
  })

  it('returns nothing when the mentor has no active authority classes', async () => {
    vi.mocked(mentoringScopeClassIds).mockResolvedValue([])
    vi.mocked(selectSessionPage).mockResolvedValue({ items: [], total: 0 } as never)
    await expect(listMenteeSessionTimings(actor, PAGE)).resolves.toEqual({ items: [], total: 0 })
  })
})
