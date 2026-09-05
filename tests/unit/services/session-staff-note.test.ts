import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/class-tutor-validation', () => ({ assertClassTutor: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveTutorRowsForClass: vi.fn(),
  selectActiveClassIdsForStudent: vi.fn(),
}))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  selectSessionAsService: vi.fn(),
  selectTutorOverlappingSessions: vi.fn(),
  insertSession: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/data/attendance', () => ({ studentHasAttendance: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { selectActiveTutorRowsForClass } from '@/lib/data/class-membership'
import { insertSession, selectTutorOverlappingSessions } from '@/lib/data/class-sessions'
import { saveSessionTimes } from '@/lib/services/attendance/sessions'

const ACTOR = 'a0000000-0000-4000-8000-000000000001'
const actor = { id: ACTOR } as never
const base = { classId: 'class-1', sessionDate: '2026-08-05' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(insertSession).mockResolvedValue({ id: 's1' } as never)
  vi.mocked(selectActiveTutorRowsForClass).mockResolvedValue([{ id: 'ct1', tutor_id: ACTOR }] as never)
  vi.mocked(selectTutorOverlappingSessions).mockResolvedValue([])
})

describe('saveSessionTimes - staff note (only manageClassContent may write it)', () => {
  it('writes staff_note + summary when canEditStaffNote, and only the actual window', async () => {
    await saveSessionTimes(actor, {
      ...base,
      actual_start: '2026-08-05T10:00:00Z',
      actual_end: '2026-08-05T11:00:00Z',
      summary: 'Covered fractions',
      staff_note: 'Parent asked to watch attendance',
      canEditStaffNote: true,
    })
    expect(insertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        actual_start: '2026-08-05T10:00:00Z',
        actual_end: '2026-08-05T11:00:00Z',
        summary: 'Covered fractions',
        staff_note: 'Parent asked to watch attendance',
      }),
    )
    // Retired fields are no longer written (so they are preserved on the row); student
    // entry is a roster fact set on the mark form, not part of the session payload.
    const payload = vi.mocked(insertSession).mock.calls[0][0]
    expect(payload).not.toHaveProperty('scheduled_start')
    expect(payload).not.toHaveProperty('tutor_join_at')
  })

  it('clears staff_note when blank (and allowed)', async () => {
    await saveSessionTimes(actor, { ...base, staff_note: '', canEditStaffNote: true })
    expect(insertSession).toHaveBeenCalledWith(expect.objectContaining({ staff_note: null }))
  })

  it('OMITS staff_note entirely when NOT allowed (a mentor editing times/summary preserves it)', async () => {
    await saveSessionTimes(actor, {
      ...base,
      summary: 'Mentor note in the summary',
      staff_note: 'sneaky attempt',
      canEditStaffNote: false,
    })
    const payload = vi.mocked(insertSession).mock.calls[0][0]
    expect(payload).toMatchObject({ summary: 'Mentor note in the summary' })
    expect(payload).not.toHaveProperty('staff_note')
  })
})
