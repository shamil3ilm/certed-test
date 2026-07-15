import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { addTutor, removeTutor } from '@/lib/services/classTeachers'
import { PermissionError, ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const teacherActor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const activeTeacher = { id: 'teacher-2', role: 'teacher', status: 'active' } as any

beforeEach(() => vi.resetAllMocks())

describe('addTutor / removeTutor are admin-only', () => {
  it('reject a non-admin actor, without touching the DB', async () => {
    await expect(addTutor(teacherActor, { classId: 'class-1', teacherId: 'teacher-2' })).rejects.toBeInstanceOf(PermissionError)
    await expect(removeTutor(teacherActor, { classId: 'class-1', teacherId: 'teacher-2' })).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor rejects a target that is not an active teacher (e.g. a student id was substituted)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-1', role: 'student', status: 'active' } as any)
    await expect(addTutor(admin, { classId: 'class-1', teacherId: 'stud-1' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor assigns and audits class.assign_teacher for an admin + active teacher', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTeacher)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await addTutor(admin, { classId: 'class-1', teacherId: 'teacher-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.assign_teacher', entity_type: 'class_teacher', entity_id: 'class-1',
    })
  })

  it('removeTutor unassigns and audits class.unassign_teacher for an admin', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeTutor(admin, { classId: 'class-1', teacherId: 'teacher-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.unassign_teacher', entity_type: 'class_teacher', entity_id: 'class-1',
    })
  })
})
