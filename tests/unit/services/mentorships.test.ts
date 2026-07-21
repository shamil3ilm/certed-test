import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({ loadActivePersonas: vi.fn(), hasPersona: vi.fn(), requireAdminOrSubAdminPersona: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { loadActivePersonas, hasPersona, requireAdminOrSubAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import {
  assignMentor,
  assignMentorFromActionInput,
  removeMentor,
  removeMentorFromActionInput,
  validateAssignMentorInput,
  validateRemoveMentorInput,
} from '@/lib/services/mentorships'
import { PermissionError, ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const student = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const tutorProfile = { id: 'teach-1', role: 'tutor' }
const mentorProfile = { id: 'ment-1', role: 'mentor' }
const studentProfile = { id: 'stud-1', role: 'student' }

beforeEach(() => vi.clearAllMocks())

describe('assignMentor / removeMentor are admin/sub_admin-only', () => {
  it('reject a tutor or student actor, without touching the DB', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockRejectedValueOnce(new PermissionError('Admin or sub-admin only.'))
    await expect(assignMentor(student, { mentorId: 'teach-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireAdminOrSubAdminPersona).mockRejectedValueOnce(new PermissionError('Admin or sub-admin only.'))
    await expect(removeMentor(student, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assignMentor rejects when the mentor id is neither a mentor nor a tutor', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-2', role: 'student' } as any).mockResolvedValueOnce(studentProfile as any)
    await expect(assignMentor(admin, { mentorId: 'stud-2', studentId: 'stud-1' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assignMentor rejects when the mentee id is not actually a student', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById).mockResolvedValueOnce(tutorProfile as any).mockResolvedValueOnce({ id: 'teach-2', role: 'tutor' } as any)
    await expect(assignMentor(admin, { mentorId: 'teach-1', studentId: 'teach-2' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assigns and audits mentorship.assign for a valid tutor + student pair', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById).mockResolvedValueOnce(tutorProfile as any).mockResolvedValueOnce(studentProfile as any)
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // mentorships upsert
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // assignMentorPersona
    await assignMentor(admin, { mentorId: 'teach-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'mentorship.assign', entity_type: 'mentorship', entity_id: 'stud-1',
    })
  })

  it('accepts a DEDICATED mentor (role mentor, not a tutor) as the mentor side', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById).mockResolvedValueOnce(mentorProfile as any).mockResolvedValueOnce(studentProfile as any)
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // mentorships upsert
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // assignMentorPersona
    await assignMentor(admin, { mentorId: 'ment-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'mentorship.assign', entity_type: 'mentorship', entity_id: 'stud-1',
    })
  })

  it('removes and audits mentorship.remove for an admin', async () => {
    vi.mocked(requireAdminOrSubAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any) // select + update
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // removeMentorPersona
    await removeMentor(admin, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'mentorship.remove', entity_type: 'mentorship', entity_id: 'link-1',
    })
  })
})

describe('mentorship action-input helpers', () => {
  it('validates mentor assignment and removal ids from the action layer', () => {
    expect(
      validateAssignMentorInput({
        mentor_id: '550e8400-e29b-41d4-a716-446655440000',
        student_id: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).toEqual({
      mentorId: '550e8400-e29b-41d4-a716-446655440000',
      studentId: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(validateRemoveMentorInput({ id: '550e8400-e29b-41d4-a716-446655440002' })).toBe(
      '550e8400-e29b-41d4-a716-446655440002',
    )
  })

  it('rejects invalid mentorship action payloads with a typed validation error', () => {
    expect(() => validateAssignMentorInput({ mentor_id: 'bad', student_id: 'bad' })).toThrow(ValidationError)
    expect(() => validateRemoveMentorInput({ id: 'bad' })).toThrow(ValidationError)
  })

  it('delegates assign/remove mentor action input through the service boundary', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' }] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(getProfileById).mockResolvedValueOnce(tutorProfile as any).mockResolvedValueOnce(studentProfile as any)
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // mentorships upsert
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // assignMentorPersona
    await assignMentorFromActionInput(admin, {
      mentor_id: '550e8400-e29b-41d4-a716-446655440000',
      student_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'mentorship.assign', entity_type: 'mentorship', entity_id: '550e8400-e29b-41d4-a716-446655440001',
    })

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' }] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any) // select + update
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // removeMentorPersona
    await removeMentorFromActionInput(admin, { id: '550e8400-e29b-41d4-a716-446655440002' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'mentorship.remove', entity_type: 'mentorship', entity_id: '550e8400-e29b-41d4-a716-446655440002',
    })
  })
})
