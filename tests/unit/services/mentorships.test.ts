import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { assignMentor, removeMentor } from '@/lib/services/mentorships'
import { PermissionError, ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const student = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const teacherProfile = { id: 'teach-1', role: 'teacher' }
const studentProfile = { id: 'stud-1', role: 'student' }

beforeEach(() => vi.resetAllMocks())

describe('assignMentor / removeMentor are admin/sub_admin-only', () => {
  it('reject a teacher or student actor, without touching the DB', async () => {
    await expect(assignMentor(student, { teacherId: 'teach-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)
    await expect(removeMentor(student, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assignMentor rejects when the mentor id is not actually a teacher', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-2', role: 'student' } as any).mockResolvedValueOnce(studentProfile as any)
    await expect(assignMentor(admin, { teacherId: 'stud-2', studentId: 'stud-1' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assignMentor rejects when the mentee id is not actually a student', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(teacherProfile as any).mockResolvedValueOnce({ id: 'teach-2', role: 'teacher' } as any)
    await expect(assignMentor(admin, { teacherId: 'teach-1', studentId: 'teach-2' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assigns and audits mentorship.assign for a valid teacher + student pair', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(teacherProfile as any).mockResolvedValueOnce(studentProfile as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await assignMentor(admin, { teacherId: 'teach-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'mentorship.assign', entity_type: 'mentorship', entity_id: 'stud-1',
    })
  })

  it('removes and audits mentorship.remove for an admin', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeMentor(admin, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'mentorship.remove', entity_type: 'mentorship', entity_id: 'link-1',
    })
  })
})
