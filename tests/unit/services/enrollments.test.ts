import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import {
  enrolStudent,
  enrolStudentFromActionInput,
  removeStudent,
  removeStudentFromActionInput,
  countEnrollmentsPerClass,
  validateEnrollmentParams,
} from '@/lib/services/enrollments'
import { PermissionError, ValidationError } from '@/lib/errors'

const tutor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const activeStudent = { id: 'stud-1', role: 'student', status: 'active' } as any

beforeEach(() => vi.resetAllMocks())

describe('enrolStudent', () => {
  it('rejects a caller who cannot manage the class, without touching the DB', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(enrolStudent(tutor, { classId: 'class-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a target that is not an active student (crafted POST pairing an arbitrary id)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'tutor-2', role: 'tutor', status: 'active' } as any)
    await expect(enrolStudent(tutor, { classId: 'class-1', studentId: 'tutor-2' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('enrolls and audits class.enroll for a manager + active student', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await enrolStudent(tutor, { classId: 'class-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1', action: 'class.enroll', entity_type: 'enrollment', entity_id: 'class-1',
    })
  })
})

describe('removeStudent', () => {
  it('rejects a caller who cannot manage the class', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(removeStudent(tutor, { classId: 'class-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('unenrolls and audits class.unenroll for a manager', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeStudent(tutor, { classId: 'class-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1', action: 'class.unenroll', entity_type: 'enrollment', entity_id: 'class-1',
    })
  })
})

describe('countEnrollmentsPerClass', () => {
  it('aggregates class_id rows into a per-class count map', async () => {
    const rows = [{ class_id: 'c-1' }, { class_id: 'c-1' }, { class_id: 'c-2' }]
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: rows, error: null }) as any)
    const counts = await countEnrollmentsPerClass()
    expect(counts.get('c-1')).toBe(2)
    expect(counts.get('c-2')).toBe(1)
    expect(counts.get('c-3')).toBeUndefined()
  })

  it('returns an empty map when there are no active enrollments', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [], error: null }) as any)
    const counts = await countEnrollmentsPerClass()
    expect(counts.size).toBe(0)
  })
})

describe('enrollment action-input helpers', () => {
  it('validates class and student ids from the action payload', () => {
    expect(
      validateEnrollmentParams({
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        student_id: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).toEqual({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      studentId: '550e8400-e29b-41d4-a716-446655440001',
    })
  })

  it('rejects invalid action payload ids with a typed validation error', () => {
    expect(() => validateEnrollmentParams({ class_id: 'bad', student_id: 'bad' })).toThrow(ValidationError)
  })

  it('delegates enrol/remove student after validation', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await enrolStudentFromActionInput(tutor, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      student_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1', action: 'class.enroll', entity_type: 'enrollment', entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeStudentFromActionInput(tutor, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      student_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1', action: 'class.unenroll', entity_type: 'enrollment', entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
