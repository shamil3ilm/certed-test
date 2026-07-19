import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { getClassMembers } from '@/lib/services/classes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import {
  markAttendance,
  clearAttendanceSession,
  listSessionSummariesForClass,
  listAttendanceForStudentPage,
  summarizeAttendanceForStudent,
} from '@/lib/services/attendance'
import { PermissionError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
// attendanceMarkSchema requires real (RFC4122 v4-shaped) UUIDs for class_id/student_id.
const classId = '11111111-1111-4111-8111-111111111111'
const enrolledStudentId = '22222222-2222-4222-8222-222222222222'
const foreignStudentId = '33333333-3333-4333-8333-333333333333'
const roster = { tutors: [], students: [{ id: enrolledStudentId, rowId: 'e1', name: 'A', email: 'a@x.c', role: 'student' }] }

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
      actor_id: 'tutor-1', action: 'attendance.mark', entity_type: 'class', entity_id: classId,
    })
  })
})

describe('clearAttendanceSession', () => {
  it('rejects a non-manager without deleting or auditing', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(clearAttendanceSession(actor, classId, '2026-07-15')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a malformed session date', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await expect(clearAttendanceSession(actor, classId, 'not-a-date')).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('deletes the class+date marks and audits attendance.clear', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'm1' }, { id: 'm2' }], error: null }) as any)
    await expect(clearAttendanceSession(actor, classId, '2026-07-15')).resolves.toEqual({ cleared: 2 })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1', action: 'attendance.clear', entity_type: 'class', entity_id: classId,
    })
  })
})

describe('listSessionSummariesForClass', () => {
  it('groups marks by session_date and summarizes each, newest date first', async () => {
    const rows = [
      { id: '1', class_id: classId, student_id: enrolledStudentId, session_date: '2026-07-01', status: 'present', marked_by: null, created_at: 't', updated_at: 't' },
      { id: '2', class_id: classId, student_id: foreignStudentId, session_date: '2026-07-01', status: 'absent', marked_by: null, created_at: 't', updated_at: 't' },
      { id: '3', class_id: classId, student_id: enrolledStudentId, session_date: '2026-07-08', status: 'late', marked_by: null, created_at: 't', updated_at: 't' },
    ]
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: rows, error: null }) as any)
    const result = await listSessionSummariesForClass(classId)
    expect(result).toEqual([
      { session_date: '2026-07-08', present: 0, late: 1, absent: 0, total: 1, rate: 100 },
      { session_date: '2026-07-01', present: 1, late: 0, absent: 1, total: 2, rate: 50 },
    ])
  })

  it('caps the number of distinct dates returned at `limit`', async () => {
    const rows = ['2026-07-01', '2026-07-02', '2026-07-03'].map((d, i) => ({
      id: String(i), class_id: classId, student_id: enrolledStudentId, session_date: d,
      status: 'present', marked_by: null, created_at: 't', updated_at: 't',
    }))
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: rows, error: null }) as any)
    const result = await listSessionSummariesForClass(classId, 2)
    expect(result.map((s) => s.session_date)).toEqual(['2026-07-03', '2026-07-02'])
  })
})

describe('listAttendanceForStudentPage', () => {
  it('requests the correct range and returns items + total', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 45 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listAttendanceForStudentPage(enrolledStudentId, { page: 3, pageSize: 20, classId })
    const builder = client.from.mock.results[0].value
    // page 3, pageSize 20 -> rows 40..59
    expect(builder.range).toHaveBeenCalledWith(40, 59)
    expect(builder.eq).toHaveBeenCalledWith('student_id', enrolledStudentId)
    expect(builder.eq).toHaveBeenCalledWith('class_id', classId)
    expect(result.total).toBe(45)
  })
})

describe('summarizeAttendanceForStudent', () => {
  it('runs four head-only counts (present/late/absent/total) and computes the rate', async () => {
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 6 })) // present
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 2 })) // late
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 2 })) // absent
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 10 })), // total
    }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await summarizeAttendanceForStudent(enrolledStudentId)
    expect(result).toEqual({ present: 6, late: 2, absent: 2, total: 10, rate: 80 })
  })

  it('returns a zero summary (not NaN) when there are no rows at all', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await summarizeAttendanceForStudent(enrolledStudentId)
    expect(result).toEqual({ present: 0, late: 0, absent: 0, total: 0, rate: 0 })
  })
})
