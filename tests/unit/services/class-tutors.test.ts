import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({ loadActivePersonas: vi.fn(), hasPersona: vi.fn(), requireAdminPersona: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { loadActivePersonas, hasPersona, requireAdminPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import {
  addTutor,
  addTutorFromActionInput,
  removeTutor,
  removeTutorFromActionInput,
  validateClassTutorParams,
} from '@/lib/services/class-tutors'
import { PermissionError, ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const tutorActor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const activeTutor = { id: 'tutor-2', role: 'tutor', status: 'active' } as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPersona).mockResolvedValue(undefined)
})

describe('addTutor / removeTutor are admin-only', () => {
  it('reject a non-admin actor, without touching the DB', async () => {
    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(addTutor(tutorActor, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(removeTutor(tutorActor, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor rejects a target that is not an active tutor (e.g. a student id was substituted)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-1', role: 'student', status: 'active' } as any)
    await expect(addTutor(admin, { classId: 'class-1', tutorId: 'stud-1' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor assigns and audits class.assign_tutor for an admin + active tutor', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTutor)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await addTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.assign_tutor', entity_type: 'class_tutor', entity_id: 'class-1',
    })
  })

  it('removeTutor unassigns and audits class.unassign_tutor for an admin', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.unassign_tutor', entity_type: 'class_tutor', entity_id: 'class-1',
    })
  })
})

describe('class-tutor action-input helpers', () => {
  it('validates class and tutor ids from the action payload', () => {
    expect(
      validateClassTutorParams({
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        tutor_id: '550e8400-e29b-41d4-a716-446655440001',
      }),
    ).toEqual({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      tutorId: '550e8400-e29b-41d4-a716-446655440001',
    })
  })

  it('rejects invalid action payload ids with a typed validation error', () => {
    expect(() => validateClassTutorParams({ class_id: 'bad', tutor_id: 'bad' })).toThrow(ValidationError)
  })

  it('delegates add/remove tutor after validation', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTutor)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await addTutorFromActionInput(admin, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      tutor_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'class.assign_tutor', entity_type: 'class_tutor', entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await removeTutorFromActionInput(admin, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      tutor_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'class.unassign_tutor', entity_type: 'class_tutor', entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
