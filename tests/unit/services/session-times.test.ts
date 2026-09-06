import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/class-tutor-validation', () => ({ assertClassTutor: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveTutorRowsForClass: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectTutorOverlappingSessions: vi.fn(),
  selectSessionsForDate: vi.fn(),
  selectSessionsForDateAsService: vi.fn(),
  selectSessionByIdAsService: vi.fn(),
  insertSession: vi.fn(),
  updateSessionById: vi.fn(),
  deleteSessionById: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { assertClassTutor } from '@/lib/services/class-tutor-validation'
import { selectActiveTutorRowsForClass } from '@/lib/data/class-membership'
import {
  insertSession,
  selectSessionByIdAsService,
  selectTutorOverlappingSessions,
  updateSessionById,
} from '@/lib/data/class-sessions'
import { saveSessionTimes } from '@/lib/services/attendance/sessions'
import { PermissionError, ValidationError } from '@/lib/errors'

const ACTOR = 'a0000000-0000-4000-8000-000000000001'
const OTHER_TUTOR = 'b0000000-0000-4000-8000-000000000002'
const actor = { id: ACTOR } as any
const base = { classId: 'class-1', sessionDate: '2026-08-05' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(insertSession).mockResolvedValue({ id: 's1' } as any)
  vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([])
})

describe('saveSessionTimes - each recording is its own record', () => {
  const SESSION_ID = 'e0000000-0000-4000-8000-000000000009'

  beforeEach(() => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: ACTOR }] as any)
  })

  it('INSERTS a new session when no session id is supplied - a second entry that day does not replace the first', async () => {
    await saveSessionTimes(actor, {
      ...base,
      actual_start: '2026-08-05T09:00:00.000Z',
      actual_end: '2026-08-05T10:00:00.000Z',
    })
    await saveSessionTimes(actor, {
      ...base,
      actual_start: '2026-08-05T11:00:00.000Z',
      actual_end: '2026-08-05T12:00:00.000Z',
    })
    // Two recordings on the SAME class and date => two inserts, never an overwrite.
    expect(insertSession).toHaveBeenCalledTimes(2)
    expect(updateSessionById).not.toHaveBeenCalled()
    expect(insertSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ class_id: 'class-1', session_date: '2026-08-05' }),
    )
  })

  it('UPDATES the named session when a session id is supplied', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION_ID,
      class_id: 'class-1',
      session_date: '2026-08-05',
      actual_start: null,
      actual_end: null,
    } as any)
    vi.mocked(updateSessionById).mockResolvedValue({ id: SESSION_ID } as any)
    await saveSessionTimes(actor, {
      ...base,
      sessionId: SESSION_ID,
      actual_start: '2026-08-05T09:00:00.000Z',
      actual_end: '2026-08-05T10:00:00.000Z',
    })
    expect(updateSessionById).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({ tutor_id: ACTOR }))
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('refuses a session id belonging to ANOTHER class', async () => {
    vi.mocked(selectSessionByIdAsService).mockResolvedValue({
      id: SESSION_ID,
      class_id: 'a-different-class',
      session_date: '2026-08-05',
    } as any)
    await expect(saveSessionTimes(actor, { ...base, sessionId: SESSION_ID })).rejects.toBeInstanceOf(PermissionError)
    expect(updateSessionById).not.toHaveBeenCalled()
    expect(insertSession).not.toHaveBeenCalled()
  })
})

describe('saveSessionTimes tutor_id guard', () => {
  it('defaults tutor_id to the recorder when they teach the class', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: ACTOR }] as any)
    await saveSessionTimes(actor, { ...base })
    expect(loadPersonaFlags).not.toHaveBeenCalled()
    expect(assertClassTutor).not.toHaveBeenCalled()
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: ACTOR }))
  })

  it('defaults to the class tutor - NOT the recorder - when a mentor/admin records', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: OTHER_TUTOR }] as any)
    await saveSessionTimes(actor, { ...base })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: OTHER_TUTOR }))
  })

  it('defaults to null when the class has no assigned tutor', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([])
    await saveSessionTimes(actor, { ...base })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: null }))
  })

  it('rejects a TUTOR or MENTOR recording a session for ANOTHER tutor', async () => {
    // Attributing a session to someone else moves billable hours onto THEIR pay slip
    // (0095), so it stays an academy-authority act - not something a colleague can do.
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: false } as any)
    await expect(saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })).rejects.toBeInstanceOf(PermissionError)
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('lets a SUB-ADMIN record for another tutor - RLS already permits it', async () => {
    // 0092 gave sub_admin academy-wide authority over class-scoped tables and widened
    // teaches_class() accordingly, so class_sessions_insert already accepts this row.
    // The app was refusing what the database allows - the app/RLS divergence 0092 set
    // out to remove.
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: true } as any)
    vi.mocked(assertClassTutor).mockResolvedValue(undefined)
    await saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })
    expect(assertClassTutor).toHaveBeenCalledWith(OTHER_TUTOR, 'class-1')
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: OTHER_TUTOR }))
  })

  it('rejects a malformed tutor_id even from an admin', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    await expect(saveSessionTimes(actor, { ...base, tutor_id: 'not-a-uuid' })).rejects.toBeInstanceOf(ValidationError)
    expect(assertClassTutor).not.toHaveBeenCalled()
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('lets an admin record for another tutor who is assigned to the class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(assertClassTutor).mockResolvedValue(undefined)
    await saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })
    expect(assertClassTutor).toHaveBeenCalledWith(OTHER_TUTOR, 'class-1')
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: OTHER_TUTOR }))
  })

  it('propagates the assignment failure when the tutor does not teach this class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(assertClassTutor).mockRejectedValue(
      new ValidationError('tutor_id must be a tutor assigned to this class'),
    )
    await expect(saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })).rejects.toBeInstanceOf(ValidationError)
    expect(insertSession).not.toHaveBeenCalled()
  })
})

describe('saveSessionTimes window validation', () => {
  const START = '2026-08-05T10:00:00.000Z'

  it('rejects an end BEFORE the start', async () => {
    await expect(
      saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-05T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('rejects an end EQUAL to the start (zero-length)', async () => {
    await expect(saveSessionTimes(actor, { ...base, actual_start: START, actual_end: START })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('rejects an end with NO start', async () => {
    await expect(saveSessionTimes(actor, { ...base, actual_start: '', actual_end: START })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('rejects a session longer than 24 hours', async () => {
    await expect(
      saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-06T11:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(insertSession).not.toHaveBeenCalled()
  })

  it('accepts a valid window (end after start, within a day)', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([])
    await saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-05T11:30:00.000Z' })
    expect(insertSession).toHaveBeenCalledWith(
      expect.objectContaining({ actual_start: START, actual_end: '2026-08-05T11:30:00.000Z' }),
    )
  })
})
