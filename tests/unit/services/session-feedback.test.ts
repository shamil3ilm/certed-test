import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  upsertSession: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/attendance', () => ({ studentHasAttendance: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { studentHasAttendance } from '@/lib/data/attendance'
import { writeStudentSessionFeedback } from '@/lib/data/class-sessions'
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
    expect(writeStudentSessionFeedback).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('rejects a date the student has no attendance record for (blocks arbitrary session rows)', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(false)
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: 'good' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(writeStudentSessionFeedback).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('writes trimmed feedback + audits for the enrolled student on an attended session', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    await saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: '  Great session  ' })
    expect(studentHasAttendance).toHaveBeenCalledWith('class-1', 'stud-1', '2026-08-05')
    expect(writeStudentSessionFeedback).toHaveBeenCalledWith('class-1', '2026-08-05', 'Great session')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(student, 'attendance.feedback', 'class', 'class-1')
  })

  it('stores empty feedback as null (clears it)', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    await saveSessionFeedback(student, { classId: 'class-1', sessionDate: '2026-08-05', feedback: '   ' })
    expect(writeStudentSessionFeedback).toHaveBeenCalledWith('class-1', '2026-08-05', null)
  })
})
