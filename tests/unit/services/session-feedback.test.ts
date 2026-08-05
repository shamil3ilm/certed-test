import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  upsertSession: vi.fn(),
  upsertSessionStudentFeedback: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { upsertSessionStudentFeedback } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { saveSessionFeedback } from '@/lib/services/attendance/sessions'
import { PermissionError, ValidationError } from '@/lib/errors'

const student = { id: 'stud-1' } as any
beforeEach(() => vi.resetAllMocks())

describe('saveSessionFeedback', () => {
  it('rejects an invalid date before any DB work', async () => {
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionDate: 'not-a-date', feedback: 'x' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(selectActiveClassIdsForStudent).not.toHaveBeenCalled()
  })

  it('rejects an actor who is not the class’s enrolled student', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['other-class'])
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: 'good' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(upsertSessionStudentFeedback).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('writes trimmed feedback + audits for the enrolled student', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    await saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: '  Great session  ' })
    expect(upsertSessionStudentFeedback).toHaveBeenCalledWith('class-1', '2026-08-05', 'Great session')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(student, 'attendance.feedback', 'class', 'class-1')
  })

  it('stores empty feedback as null (clears it)', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    await saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: '   ' })
    expect(upsertSessionStudentFeedback).toHaveBeenCalledWith('class-1', '2026-08-05', null)
  })
})
