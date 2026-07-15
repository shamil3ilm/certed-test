import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { enrolStudent, removeStudent } from '@/lib/services/enrollments'
import { PermissionError, ValidationError } from '@/lib/errors'

const teacher = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const activeStudent = { id: 'stud-1', role: 'student', status: 'active' } as any

beforeEach(() => vi.resetAllMocks())

describe('enrolStudent', () => {
  it('rejects a caller who cannot manage the class, without touching the DB', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(enrolStudent(teacher, { classId: 'class-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a target that is not an active student (crafted POST pairing an arbitrary id)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'teacher-2', role: 'teacher', status: 'active' } as any)
    await expect(enrolStudent(teacher, { classId: 'class-1', studentId: 'teacher-2' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('enrolls and audits class.enroll for a manager + active student', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await enrolStudent(teacher, { classId: 'class-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'class.enroll', entity_type: 'enrollment', entity_id: 'class-1',
    })
  })
})

describe('removeStudent', () => {
  it('rejects a caller who cannot manage the class', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(removeStudent(teacher, { classId: 'class-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('unenrolls and audits class.unenroll for a manager', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeStudent(teacher, { classId: 'class-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'class.unenroll', entity_type: 'enrollment', entity_id: 'class-1',
    })
  })
})
