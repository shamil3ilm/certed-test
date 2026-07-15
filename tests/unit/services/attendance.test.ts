import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { markAttendance } from '@/lib/services/attendance'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
// attendanceMarkSchema requires real (RFC4122 v4-shaped) UUIDs for class_id/student_id.
const classId = '11111111-1111-4111-8111-111111111111'
const enrolledStudentId = '22222222-2222-4222-8222-222222222222'
const foreignStudentId = '33333333-3333-4333-8333-333333333333'
const roster = { teachers: [], students: [{ id: enrolledStudentId, rowId: 'e1', name: 'A', email: 'a@x.c', role: 'student' }] }

beforeEach(() => vi.resetAllMocks())

describe('markAttendance', () => {
  it('rejects a non-manager without reading the roster or writing', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      markAttendance(actor, { classId, sessionDate: '2026-07-15', marks: [{ student_id: enrolledStudentId, status: 'present' }] }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(getClassMembers).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('silently drops a mark for a student not on this class roster', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getClassMembers).mockResolvedValueOnce(roster as any)
    await expect(
      markAttendance(actor, { classId, sessionDate: '2026-07-15', marks: [{ student_id: foreignStudentId, status: 'present' }] }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid status for an enrolled student (nothing to save)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getClassMembers).mockResolvedValueOnce(roster as any)
    await expect(
      markAttendance(actor, { classId, sessionDate: '2026-07-15', marks: [{ student_id: enrolledStudentId, status: 'not-a-status' }] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('marks enrolled students and audits attendance.mark', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getClassMembers).mockResolvedValueOnce(roster as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    const result = await markAttendance(actor, {
      classId,
      sessionDate: '2026-07-15',
      marks: [{ student_id: enrolledStudentId, status: 'present' }, { student_id: foreignStudentId, status: 'absent' }],
    })
    expect(result).toEqual({ saved: 1 })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'attendance.mark', entity_type: 'class', entity_id: classId,
    })
  })
})
