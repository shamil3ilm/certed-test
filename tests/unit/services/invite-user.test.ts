import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({
  addUser: vi.fn(),
  validateAddUserInput: vi.fn(),
  deleteUnregisteredProfile: vi.fn(),
}))
vi.mock('@/lib/services/mentorships', () => ({ assignMentor: vi.fn(), assertAssignableMentor: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))

import { inviteUser } from '@/lib/services/user-invites'
import { addUser, validateAddUserInput, deleteUnregisteredProfile } from '@/lib/services/users'
import { assignMentor, assertAssignableMentor } from '@/lib/services/mentorships'
import { requireActorCapability } from '@/lib/services/authorization'
import { PermissionError } from '@/lib/errors'

const actor = { id: 'actor-1' } as never
const studentRow = { email: 's@x.test', role: 'student', mentor_id: 'm1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(validateAddUserInput).mockReturnValue({
    user: { email: 's@x.test', role: 'student' } as never,
    mentorId: 'm1',
  })
  vi.mocked(addUser).mockResolvedValue({ profile: { id: 'p1', email: 's@x.test' } as never, code: 'ABCD2345' })
})

describe('inviteUser - the whole per-row create', () => {
  it('returns the profile and its one-time code', async () => {
    const result = await inviteUser(actor, studentRow as never)
    expect(result.code).toBe('ABCD2345')
    expect(result.profile.id).toBe('p1')
  })

  // The ORDER is the contract, not an implementation detail: pre-flighting after the create
  // burns a setup code on a request that cannot complete.
  it('pre-flights the mentor BEFORE creating the account', async () => {
    const order: string[] = []
    vi.mocked(requireActorCapability).mockImplementation(async () => void order.push('capability'))
    vi.mocked(assertAssignableMentor).mockImplementation(async () => {
      order.push('assignable')
      // It returns the mentor row now - assignMentor's notification names them - and inviteUser
      // ignores the value, so any profile-shaped stand-in keeps the order assertion honest.
      return { id: 'm1', full_name: 'A Mentor' } as never
    })
    vi.mocked(addUser).mockImplementation(async () => {
      order.push('create')
      return { profile: { id: 'p1', email: 's@x.test' } as never, code: 'ABCD2345' }
    })
    await inviteUser(actor, studentRow as never)
    expect(order).toEqual(['capability', 'assignable', 'create'])
  })

  it('refuses before creating anything when the actor may not assign mentors', async () => {
    vi.mocked(requireActorCapability).mockRejectedValue(new PermissionError('nope'))
    await expect(inviteUser(actor, studentRow as never)).rejects.toThrow(PermissionError)
    expect(addUser).not.toHaveBeenCalled()
  })

  // Without the rollback, a failed assign leaves a pending account whose code was shown to
  // nobody, and re-adding that email then collides.
  it('rolls the new account back if the mentor assign fails after creation', async () => {
    vi.mocked(assignMentor).mockRejectedValue(new Error('stale mentor'))
    await expect(inviteUser(actor, studentRow as never)).rejects.toThrow('stale mentor')
    expect(deleteUnregisteredProfile).toHaveBeenCalledWith('p1')
  })

  it('skips the mentor steps entirely for a non-student', async () => {
    vi.mocked(validateAddUserInput).mockReturnValue({
      user: { email: 't@x.test', role: 'tutor' } as never,
      mentorId: null,
    })
    await inviteUser(actor, { email: 't@x.test', role: 'tutor' } as never)
    expect(requireActorCapability).not.toHaveBeenCalled()
    expect(assignMentor).not.toHaveBeenCalled()
  })
})
