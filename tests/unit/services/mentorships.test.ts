import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({ loadActivePersonas: vi.fn(), hasPersona: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
// Notifying writes a row of its own through the admin client. Unmocked, each notification would
// consume one of the queued clients below, and the call it was queued for would get undefined.
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))

import { loadActivePersonas, hasPersona } from '@/lib/permission/personas'
import { getProfileById } from '@/lib/services/users'
import { requireActorCapability } from '@/lib/services/authorization'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/data/audit'
import {
  assignMentor,
  assertAssignableMentor,
  assignMentorFromActionInput,
  removeMentor,
  removeMentorFromActionInput,
  replaceMentor,
  validateAssignMentorInput,
  validateRemoveMentorInput,
} from '@/lib/services/mentorships'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const student = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const tutorProfile = { id: 'teach-1', role: 'tutor', status: 'active' }
const mentorProfile = { id: 'ment-1', role: 'mentor', status: 'active' }
const studentProfile = { id: 'stud-1', role: 'student', status: 'active' }

// resetAllMocks (not clearAllMocks) so a test's unconsumed mockResolvedValueOnce
// queue can't leak into the next - assignMentor now short-circuits on the mentor
// pre-flight, so a reject-path test may not consume every queued profile.
beforeEach(() => vi.resetAllMocks())

/** The service-role client whose RPC answers the mentorship write. */
function assignWrite(rpcResult: { data: unknown; error: { message: string } | null }) {
  const client = makeClient({ data: null, error: null }, rpcResult as never)
  vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
  return client
}

describe('assignMentor / removeMentor require the manageMentorships capability', () => {
  it('reject an actor without manageMentorships, without touching the DB', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(
      new PermissionError('You are not allowed to manage mentors.'),
    )
    await expect(assignMentor(student, { mentorId: 'teach-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(
      PermissionError,
    )

    vi.mocked(requireActorCapability).mockRejectedValueOnce(
      new PermissionError('You are not allowed to manage mentors.'),
    )
    await expect(removeMentor(student, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(getProfileById).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assertAssignableMentor rejects a disabled mentor (stale/revoked dropdown pick)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'ment-1', role: 'mentor', status: 'disabled' } as any)
    await expect(assertAssignableMentor('ment-1')).rejects.toBeInstanceOf(ValidationError)
  })

  it('assertAssignableMentor rejects a role that is neither mentor nor tutor', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ id: 'stud-2', role: 'student', status: 'active' } as any)
    await expect(assertAssignableMentor('stud-2')).rejects.toBeInstanceOf(ValidationError)
  })

  it('assignMentor rejects when the mentor id is neither a mentor nor a tutor', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce({ id: 'stud-2', role: 'student' } as any)
      .mockResolvedValueOnce(studentProfile as any)
    await expect(assignMentor(admin, { mentorId: 'stud-2', studentId: 'stud-1' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assignMentor rejects when the mentee id is not actually a student', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(tutorProfile as any)
      .mockResolvedValueOnce({ id: 'teach-2', role: 'tutor' } as any)
    await expect(assignMentor(admin, { mentorId: 'teach-1', studentId: 'teach-2' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('assigns and audits mentorship.assign for a valid tutor + student pair', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(tutorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    const client = assignWrite({ data: 'link-1', error: null })
    await assignMentor(admin, { mentorId: 'teach-1', studentId: 'stud-1' })
    // The link and the persona that grants access are ONE call, so neither can land alone.
    expect(client.rpc).toHaveBeenCalledWith('assign_mentorship', { p_mentor_id: 'teach-1', p_student_id: 'stud-1' })
    expect(client.from).not.toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'mentorship.assign',
      entity_type: 'mentorship',
      entity_id: 'stud-1',
    })
  })

  it('accepts a DEDICATED mentor (role mentor, not a tutor) as the mentor side', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(mentorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    assignWrite({ data: 'link-1', error: null })
    await assignMentor(admin, { mentorId: 'ment-1', studentId: 'stud-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'mentorship.assign',
      entity_type: 'mentorship',
      entity_id: 'stud-1',
    })
  })

  it('assigns a mentor to a freshly invited (pending) student - that is how a student is created', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(mentorProfile as any)
      .mockResolvedValueOnce({ id: 'stud-2', role: 'student', status: 'pending' } as any)
    assignWrite({ data: 'link-9', error: null })

    await assignMentor(admin, { mentorId: 'ment-1', studentId: 'stud-2' })

    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'mentorship.assign' }))
  })

  it('refuses a REVOKED student: their mentor would hold access to a closed account', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(mentorProfile as any)
      .mockResolvedValueOnce({ id: 'stud-3', role: 'student', status: 'disabled' } as any)

    await expect(assignMentor(admin, { mentorId: 'ment-1', studentId: 'stud-3' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('refuses, and audits nothing, when the mentor is revoked between the check and the write', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(tutorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    assignWrite({ data: null, error: { message: 'mentor_not_assignable' } })

    await expect(assignMentor(admin, { mentorId: 'teach-1', studentId: 'stud-1' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('surfaces a failed write and audits nothing', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(tutorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    assignWrite({ data: null, error: { message: 'connection reset' } })

    await expect(assignMentor(admin, { mentorId: 'teach-1', studentId: 'stud-1' })).rejects.toThrow(
      'mentorships.assign: connection reset',
    )
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('removes and audits mentorship.remove for an admin', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    // The pair is read first (for the notification), then the RPC runs.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any,
    )
    const client = assignWrite({ data: true, error: null })
    await removeMentor(admin, 'link-1')
    expect(client.rpc).toHaveBeenCalledWith('remove_mentorship', { p_id: 'link-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'mentorship.remove',
      entity_type: 'mentorship',
      entity_id: 'link-1',
    })
  })

  it('removeMentor on a bogus id throws NotFound and does not audit (no phantom remove)', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    // The pair read comes first, then remove_mentorship reports that the id names no mentorship.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any,
    )
    assignWrite({ data: false, error: null })
    await expect(removeMentor(admin, 'nope')).rejects.toBeInstanceOf(NotFoundError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses to remove an active student's only mentor, and says how to swap instead", async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    // removeMentor reads the pair first (for the notification), then calls the RPC.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any,
    )
    // 0120 refuses the last live link of an active student: a student in nobody's mentee list
    // is watched by nobody.
    assignWrite({ data: null, error: { message: 'last_mentor' } })
    await expect(removeMentor(admin, 'link-1')).rejects.toBeInstanceOf(ValidationError)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

/**
 * Swapping a mentor is the reason removing the last one can be refused without friction: the
 * replacement is assigned first, so the student is never left unmentored and the guard never
 * fires on a swap.
 */
describe('replaceMentor', () => {
  /** One client for the whole swap, recording the RPCs it is asked for. The ORDER of that list is
   *  the property under test, and it stays true however many notifications a step also sends. */
  function recordingClient(answers: (fn: string) => { data: unknown; error: { message: string } | null }) {
    const rpcs: string[] = []
    const client = {
      from: vi.fn(() => queryBuilder({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null })),
      rpc: vi.fn(async (fn: string) => {
        rpcs.push(fn)
        return answers(fn)
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    return rpcs
  }

  it('assigns the replacement BEFORE removing the old link, auditing both', async () => {
    vi.mocked(requireActorCapability).mockResolvedValue(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(mentorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    const rpcs = recordingClient((fn) =>
      fn === 'assign_mentorship' ? { data: 'link-2', error: null } : { data: true, error: null },
    )

    await replaceMentor(admin, { linkId: 'link-1', mentorId: 'ment-1', studentId: 'stud-1' })

    expect(rpcs).toEqual(['assign_mentorship', 'remove_mentorship'])
    expect(vi.mocked(writeAudit).mock.calls.map((c) => c[0].action)).toEqual(['mentorship.assign', 'mentorship.remove'])
  })

  it('leaves the existing mentor in place when the replacement cannot be assigned', async () => {
    vi.mocked(requireActorCapability).mockResolvedValue(undefined)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(mentorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    const rpcs = recordingClient(() => ({ data: null, error: { message: 'mentor_not_assignable' } }))

    await expect(
      replaceMentor(admin, { linkId: 'link-1', mentorId: 'ment-1', studentId: 'stud-1' }),
    ).rejects.toBeInstanceOf(ValidationError)
    // The removal was never reached, so the student keeps the mentor they had.
    expect(rpcs).toEqual(['assign_mentorship'])
    expect(writeAudit).not.toHaveBeenCalled()
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
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(getProfileById)
      .mockResolvedValueOnce(tutorProfile as any)
      .mockResolvedValueOnce(studentProfile as any)
    assignWrite({ data: 'link-1', error: null })
    await assignMentorFromActionInput(admin, {
      mentor_id: '550e8400-e29b-41d4-a716-446655440000',
      student_id: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'mentorship.assign',
      entity_type: 'mentorship',
      entity_id: '550e8400-e29b-41d4-a716-446655440001',
    })

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    // The pair read precedes the RPC, as in removeMentor's own tests above.
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { mentor_id: 'ment-1', student_id: 'stud-1' }, error: null }) as any,
    )
    assignWrite({ data: true, error: null })
    await removeMentorFromActionInput(admin, { id: '550e8400-e29b-41d4-a716-446655440002' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'mentorship.remove',
      entity_type: 'mentorship',
      entity_id: '550e8400-e29b-41d4-a716-446655440002',
    })
  })
})
