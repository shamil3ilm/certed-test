import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/class-sessions', () => ({
  selectRecentSessions: vi.fn(),
  selectSession: vi.fn(),
  upsertSession: vi.fn(),
  writeStudentSessionFeedback: vi.fn(),
  selectSessionByIdAsService: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/attendance', () => ({ studentHasAttendance: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn(), notifyClassRoleBestEffort: vi.fn() }))

import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { studentHasAttendance } from '@/lib/data/attendance'
import { writeStudentSessionFeedback, selectSessionByIdAsService } from '@/lib/data/class-sessions'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { saveSessionFeedback } from '@/lib/services/attendance/sessions'
import { PermissionError, ValidationError } from '@/lib/errors'

const student = { id: 'stud-1' } as any
const SES = '3f1c2b7e-8a4d-4c1e-9b52-6d0a7e4f1a10'
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectSessionByIdAsService).mockResolvedValue(null as any)
})

describe('saveSessionFeedback', () => {
  it('rejects a malformed session id before any DB work', async () => {
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionId: 'not-a-uuid', feedback: 'x' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(selectActiveClassIdsForStudent).not.toHaveBeenCalled()
  })

  it('rejects an actor who is not the class’s enrolled student', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['other-class'])
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: 'good' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(writeStudentSessionFeedback).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('rejects a session the student was not marked in', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(false)
    await expect(
      saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: 'good' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(writeStudentSessionFeedback).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('writes trimmed feedback + audits for the enrolled student on an attended session', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    await saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: '  Great session  ' })
    expect(studentHasAttendance).toHaveBeenCalledWith('class-1', 'stud-1', SES)
    expect(writeStudentSessionFeedback).toHaveBeenCalledWith('class-1', SES, 'Great session')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(student, 'attendance.feedback', 'class', 'class-1')
  })

  it('stores empty feedback as null (clears it), and tells nobody', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    await saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: '   ' })
    expect(writeStudentSessionFeedback).toHaveBeenCalledWith('class-1', SES, null)
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('tells the class tutors that the student left feedback, naming the session’s own date', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    vi.mocked(selectSessionByIdAsService).mockResolvedValueOnce({ id: SES, session_date: '2026-08-05' } as any)
    await saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: 'Too fast' })
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', 'tutors', {
      kind: 'class',
      title: 'A student left feedback on a session',
      body: '2026-08-05',
      link: '/classroom/class-1/attendance?date=2026-08-05',
    })
  })

  it('still tells the tutors, without a date, if the session cannot be read back', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValueOnce(['class-1'])
    vi.mocked(studentHasAttendance).mockResolvedValueOnce(true)
    vi.mocked(selectSessionByIdAsService).mockRejectedValueOnce(new Error('db down'))
    await saveSessionFeedback(student, { classId: 'class-1', sessionId: SES, feedback: 'Too fast' })
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      'tutors',
      expect.objectContaining({ body: null, link: '/classroom/class-1/attendance' }),
    )
  })
})
