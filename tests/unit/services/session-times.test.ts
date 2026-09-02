import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/class-tutor-validation', () => ({ assertClassTutor: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveTutorRowsForClass: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  upsertSession: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { assertClassTutor } from '@/lib/services/class-tutor-validation'
import { selectActiveTutorRowsForClass } from '@/lib/data/class-membership'
import { upsertSession } from '@/lib/data/class-sessions'
import { saveSessionTimes } from '@/lib/services/attendance/sessions'
import { PermissionError, ValidationError } from '@/lib/errors'

const ACTOR = 'a0000000-0000-4000-8000-000000000001'
const OTHER_TUTOR = 'b0000000-0000-4000-8000-000000000002'
const actor = { id: ACTOR } as any
const base = { classId: 'class-1', sessionDate: '2026-08-05' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(upsertSession).mockResolvedValue({ id: 's1' } as any)
})

describe('saveSessionTimes tutor_id guard', () => {
  it('defaults tutor_id to the recorder when they teach the class', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: ACTOR }] as any)
    await saveSessionTimes(actor, { ...base })
    expect(loadPersonaFlags).not.toHaveBeenCalled()
    expect(assertClassTutor).not.toHaveBeenCalled()
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: ACTOR }))
  })

  it('defaults to the class tutor - NOT the recorder - when a mentor/admin records', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: OTHER_TUTOR }] as any)
    await saveSessionTimes(actor, { ...base })
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: OTHER_TUTOR }))
  })

  it('defaults to null when the class has no assigned tutor', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([])
    await saveSessionTimes(actor, { ...base })
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: null }))
  })

  it('rejects a non-admin recording a session for ANOTHER tutor', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false } as any)
    await expect(saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })).rejects.toBeInstanceOf(PermissionError)
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('rejects a malformed tutor_id even from an admin', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    await expect(saveSessionTimes(actor, { ...base, tutor_id: 'not-a-uuid' })).rejects.toBeInstanceOf(ValidationError)
    expect(assertClassTutor).not.toHaveBeenCalled()
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('lets an admin record for another tutor who is assigned to the class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(assertClassTutor).mockResolvedValue(undefined)
    await saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })
    expect(assertClassTutor).toHaveBeenCalledWith(OTHER_TUTOR, 'class-1')
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: OTHER_TUTOR }))
  })

  it('propagates the assignment failure when the tutor does not teach this class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true } as any)
    vi.mocked(assertClassTutor).mockRejectedValue(
      new ValidationError('tutor_id must be a tutor assigned to this class'),
    )
    await expect(saveSessionTimes(actor, { ...base, tutor_id: OTHER_TUTOR })).rejects.toBeInstanceOf(ValidationError)
    expect(upsertSession).not.toHaveBeenCalled()
  })
})

describe('saveSessionTimes window validation', () => {
  const START = '2026-08-05T10:00:00.000Z'

  it('rejects an end BEFORE the start', async () => {
    await expect(
      saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-05T09:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('rejects an end EQUAL to the start (zero-length)', async () => {
    await expect(saveSessionTimes(actor, { ...base, actual_start: START, actual_end: START })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('rejects an end with NO start', async () => {
    await expect(saveSessionTimes(actor, { ...base, actual_start: '', actual_end: START })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('rejects a session longer than 24 hours', async () => {
    await expect(
      saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-06T11:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('accepts a valid window (end after start, within a day)', async () => {
    vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([])
    await saveSessionTimes(actor, { ...base, actual_start: START, actual_end: '2026-08-05T11:30:00.000Z' })
    expect(upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({ actual_start: START, actual_end: '2026-08-05T11:30:00.000Z' }),
    )
  })
})
