import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { getProfileById } from '@/lib/services/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/data/audit'
import {
  addTutor,
  addTutorFromActionInput,
  removeTutor,
  removeTutorFromActionInput,
  validateClassTutorParams,
} from '@/lib/services/class-tutors'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const tutorActor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const activeTutor = { id: 'tutor-2', role: 'tutor', status: 'active' } as any
const activeMentor = { id: 'mentor-2', role: 'mentor', status: 'active' } as any

/** The class-status read, then the client whose RPC answers the assignment write. */
function assignClients(rpcResult: { data: unknown; error: { message: string } | null }) {
  const write = makeClient({ data: null, error: null }, rpcResult as never)
  vi.mocked(createAdminClient)
    .mockReturnValueOnce(makeClient({ data: { status: 'active' }, error: null }) as any) // selectClassStatus
    .mockReturnValueOnce(write as any)
  return write
}

function unassignClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const write = makeClient({ data: null, error: null }, rpcResult as never)
  vi.mocked(createAdminClient).mockReturnValueOnce(write as any)
  return write
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActorCapability).mockResolvedValue(undefined)
})

describe('addTutor / removeTutor are admin-only', () => {
  it('reject a non-admin actor, without touching the DB', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(addTutor(tutorActor, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toBeInstanceOf(
      PermissionError,
    )

    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(removeTutor(tutorActor, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toBeInstanceOf(
      PermissionError,
    )
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor rejects a target that is not an active tutor (e.g. a student id was substituted)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-1', role: 'student', status: 'active' } as any)
    await expect(addTutor(admin, { classId: 'class-1', tutorId: 'stud-1' })).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('addTutor assigns in ONE write and audits class.assign_tutor for an admin + active tutor', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTutor)
    const write = assignClients({ data: null, error: null })
    await addTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })
    expect(write.rpc).toHaveBeenCalledWith('assign_class_tutor', { p_class_id: 'class-1', p_tutor_id: 'tutor-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.assign_tutor',
      entity_type: 'class_tutor',
      entity_id: 'class-1',
    })
  })

  it('addTutor for a dedicated mentor is the same single write - the tutor persona lands with the membership', async () => {
    // Membership and persona are one write, so there is no moment with one and not the other.
    vi.mocked(getProfileById).mockResolvedValueOnce(activeMentor)
    const write = assignClients({ data: null, error: null })
    await addTutor(admin, { classId: 'class-1', tutorId: 'mentor-2' })
    expect(write.rpc).toHaveBeenCalledTimes(1)
    expect(write.from).not.toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'class.assign_tutor' }))
  })

  it('addTutor refuses, and audits nothing, when the class is archived by the time it writes', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeTutor)
    assignClients({ data: null, error: { message: 'class_not_active' } })
    await expect(addTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toThrow(/archived/)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('removeTutor unassigns in one write and audits class.unassign_tutor for an admin', async () => {
    const write = unassignClient({ data: true, error: null })
    await removeTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })
    expect(write.rpc).toHaveBeenCalledWith('unassign_class_tutor', { p_class_id: 'class-1', p_tutor_id: 'tutor-2' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.unassign_tutor',
      entity_type: 'class_tutor',
      entity_id: 'class-1',
    })
  })

  it('removeTutor on a non-assignment throws NotFound and does not audit (no phantom unassign)', async () => {
    unassignClient({ data: false, error: null })
    await expect(removeTutor(admin, { classId: 'class-1', tutorId: 'tutor-2' })).rejects.toBeInstanceOf(NotFoundError)
    expect(writeAudit).not.toHaveBeenCalled()
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
    assignClients({ data: null, error: null })
    await addTutorFromActionInput(admin, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      tutor_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'class.assign_tutor',
      entity_type: 'class_tutor',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    unassignClient({ data: true, error: null })
    await removeTutorFromActionInput(admin, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      tutor_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'class.unassign_tutor',
      entity_type: 'class_tutor',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
