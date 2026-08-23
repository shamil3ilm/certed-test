import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/class-tutor-validation', () => ({ assertClassTutor: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveTutorRowsForClass: vi.fn(),
  selectActiveEnrollmentRefsByClassIds: vi.fn(),
  selectActiveClassIdsForStudent: vi.fn(),
}))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  selectSessionAsService: vi.fn(),
  upsertSession: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({
  studentHasAttendance: vi.fn(),
  updateJoinAtAsService: vi.fn(),
}))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { selectActiveTutorRowsForClass, selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { upsertSession } from '@/lib/data/class-sessions'
import { studentHasAttendance, updateJoinAtAsService } from '@/lib/data/attendance'
import { saveSessionTimes } from '@/lib/services/attendance/sessions'
import { ValidationError, NotFoundError } from '@/lib/errors'

const ACTOR = 'a0000000-0000-4000-8000-000000000001'
const STUDENT = 'c0000000-0000-4000-8000-000000000009'
const actor = { id: ACTOR } as never
const base = { classId: 'class-1', sessionDate: '2026-08-05' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(upsertSession).mockResolvedValue({ id: 's1' } as never)
  vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: ACTOR }] as never)
  vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([{ class_id: 'class-1', student_id: STUDENT }])
  vi.mocked(studentHasAttendance).mockResolvedValue(true)
})

describe('saveSessionTimes - staff note (not shared with student)', () => {
  it('writes staff_note and summary onto the session, and only the actual window', async () => {
    await saveSessionTimes(actor, {
      ...base,
      actual_start: '2026-08-05T10:00:00Z',
      actual_end: '2026-08-05T11:00:00Z',
      summary: 'Covered fractions',
      staff_note: 'Parent asked to watch attendance',
    })
    expect(upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        actual_start: '2026-08-05T10:00:00Z',
        actual_end: '2026-08-05T11:00:00Z',
        summary: 'Covered fractions',
        staff_note: 'Parent asked to watch attendance',
      }),
    )
    // Retired fields are no longer written (so they are preserved on the row).
    const payload = vi.mocked(upsertSession).mock.calls[0][0]
    expect(payload).not.toHaveProperty('scheduled_start')
    expect(payload).not.toHaveProperty('tutor_join_at')
  })

  it('clears staff_note when blank', async () => {
    await saveSessionTimes(actor, { ...base, staff_note: '' })
    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({ staff_note: null }))
  })
})

describe('saveSessionTimes - student entry', () => {
  it('updates the enrolled student attendance join when entry is given', async () => {
    await saveSessionTimes(actor, { ...base, student_entry: '2026-08-05T10:05:00Z' })
    expect(updateJoinAtAsService).toHaveBeenCalledWith('class-1', STUDENT, '2026-08-05', '2026-08-05T10:05:00.000Z')
  })

  it('does not touch attendance when no entry is given', async () => {
    await saveSessionTimes(actor, { ...base })
    expect(updateJoinAtAsService).not.toHaveBeenCalled()
  })

  it('rejects an entry after the session end, before writing anything', async () => {
    await expect(
      saveSessionTimes(actor, {
        ...base,
        actual_end: '2026-08-05T11:00:00Z',
        student_entry: '2026-08-05T11:30:00Z',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(upsertSession).not.toHaveBeenCalled()
  })

  it('requires attendance to be marked first, before writing anything', async () => {
    vi.mocked(studentHasAttendance).mockResolvedValue(false)
    await expect(saveSessionTimes(actor, { ...base, student_entry: '2026-08-05T10:05:00Z' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(upsertSession).not.toHaveBeenCalled()
    expect(updateJoinAtAsService).not.toHaveBeenCalled()
  })

  it('404s when the class has no active student', async () => {
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([])
    await expect(saveSessionTimes(actor, { ...base, student_entry: '2026-08-05T10:05:00Z' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(upsertSession).not.toHaveBeenCalled()
  })
})
