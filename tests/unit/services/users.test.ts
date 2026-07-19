import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/mock/env', () => ({ isMock: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadActivePersonas: vi.fn(), hasPersona: vi.fn(), loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/auth/setup-code', () => ({
  generateSetupCode: vi.fn(() => 'ABCD1234'),
  hashSetupCode: vi.fn(() => 'hashed'),
  setupCodeExpiry: vi.fn(() => '2099-01-01T00:00:00.000Z'),
  setupCodeValid: vi.fn(() => true),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES } from '@/lib/api/error-codes'
import { setupCodeValid } from '@/lib/auth/setup-code'
import { isMock } from '@/lib/mock/env'
import { writeAudit } from '@/lib/repos/audit'
import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import {
  addUser,
  addUserFromActionInput,
  revokeUser,
  revokeUserFromActionInput,
  restoreUser,
  restoreUserFromActionInput,
  editUser,
  editUserFromActionInput,
  countPeople,
  countUsersHubStats,
  listProfilesByRole,
  updateOwnProfile,
  changeOwnPassword,
  completePasswordRegistration,
  validateAddUserInput,
  validateEditUserInput,
  validateUserIdInput,
} from '@/lib/services/users'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'

const superAdmin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const subAdmin = { id: 'sub-1', email: 'sub@x.c', role: 'sub_admin', status: 'active' } as any
const otherAdmin = { id: 'admin-2', email: 'a2@x.c', role: 'admin', status: 'active' } as any
const targetTutor = { id: 'teach-1', email: 't@x.c', full_name: null, role: 'tutor', status: 'active' }
const selfActor = { id: 'self-1' } as any
const targetTutorId = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadActivePersonas).mockImplementation(async (profileId: string) => {
    if (profileId === 'admin-1' || profileId === 'admin-2') {
      return [{ profile_id: profileId, persona_name: 'admin', status: 'active', scope_type: 'global', scope_id: null }] as any
    }
    if (profileId === 'sub-1') {
      return [{ profile_id: profileId, persona_name: 'sub_admin', status: 'active', scope_type: 'global', scope_id: null }] as any
    }
    return []
  })
  vi.mocked(hasPersona).mockImplementation((personas, name) => personas.some((p: any) => p.persona_name === name))
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    const personas = await loadActivePersonas(profileId)
    const has = (name: string) => personas.some((p: any) => p.persona_name === name)
    return {
      personas,
      isAdmin: has('admin'),
      isSubAdmin: has('sub_admin'),
      isTutor: has('tutor'),
      isManager: has('admin') || has('tutor'),
      isStudent: has('student'),
      isMentor: has('mentor'),
    } as any
  })
})

describe('addUser', () => {
  it('rejects a sub_admin trying to add an admin-tier account, without any DB call', async () => {
    await expect(
      addUser(subAdmin, { email: 'new@x.c', role: 'admin' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects adding a user whose email already exists', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any)
    await expect(
      addUser(superAdmin, { email: 'exists@x.c', role: 'tutor' } as any),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('creates and audits user.add for a valid add', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // getProfileByEmail: no existing
      .mockReturnValueOnce(makeClient({ data: { id: 'new-1', email: 'new@x.c', role: 'tutor', status: 'active' }, error: null }) as any) // profile upsert
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // syncPersonaForRole (deactivate + upsert)
    const { profile, code } = await addUser(superAdmin, { email: 'new@x.c', role: 'tutor' } as any)
    expect(profile.id).toBe('new-1')
    expect(code).toBe('ABCD1234')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.add', entity_type: 'profile', entity_id: 'new-1',
    })
  })
})

describe('user action-input helpers', () => {
  it('validates add-user payloads and optional mentor assignment', () => {
    expect(
      validateAddUserInput({
        email: 'student@example.com',
        full_name: 'Student Name',
        role: 'student',
        class_level: 'Grade 7',
        mentor_id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toEqual({
      user: {
        email: 'student@example.com',
        full_name: 'Student Name',
        role: 'student',
        class_level: 'Grade 7',
      },
      mentorId: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('rejects invalid add-user payloads with a typed validation error', () => {
    expect(() =>
      validateAddUserInput({
        email: 'bad',
        role: 'bad',
      }),
    ).toThrow(ValidationError)
  })

  it('validates edit payloads (profile details only, never role) and user ids', () => {
    expect(
      validateEditUserInput({
        id: '550e8400-e29b-41d4-a716-446655440000',
        full_name: 'Updated Name',
        class_level: 'Grade 8',
      }),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      patch: {
        full_name: 'Updated Name',
        class_level: 'Grade 8',
      },
    })
    expect(validateUserIdInput({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('delegates add/revoke/restore/edit action input through the service boundary', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // getProfileByEmail
      .mockReturnValueOnce(makeClient({ data: { id: 'new-1', email: 'new@example.com', role: 'tutor', status: 'active' }, error: null }) as any) // profile upsert
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // syncPersonaForRole
    const created = await addUserFromActionInput(superAdmin, {
      email: 'new@example.com',
      role: 'tutor',
    })
    expect(created.profile.id).toBe('new-1')

    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: { ...targetTutor, id: targetTutorId }, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: { ...targetTutor, id: targetTutorId }, error: null }) as any) // isLastActiveAdmin short-circuits
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // profile update for status
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // disablePersonasForProfile
    await revokeUserFromActionInput(superAdmin, { id: targetTutorId })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'user.revoke', entity_type: 'profile', entity_id: targetTutorId,
    })

    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: { ...targetTutor, id: targetTutorId }, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: { ...targetTutor, id: targetTutorId }, error: null }) as any) // select role + update status
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // restorePersonasForProfile
    await restoreUserFromActionInput(superAdmin, { id: targetTutorId })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'user.restore', entity_type: 'profile', entity_id: targetTutorId,
    })

    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: { ...targetTutor, id: targetTutorId }, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // profile update (no role sync — role is not editable)
    await editUserFromActionInput(superAdmin, {
      id: targetTutorId,
      full_name: 'New name',
      class_level: 'Grade 8',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1', action: 'user.edit', entity_type: 'profile', entity_id: targetTutorId,
    })
  })
})

describe('revokeUser', () => {
  it('throws NotFoundError for a missing id', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(revokeUser(superAdmin, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('a sub_admin cannot revoke an admin-tier account', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { id: 'admin-2', role: 'admin', status: 'active' }, error: null }) as any,
    )
    await expect(revokeUser(subAdmin, 'admin-2')).rejects.toBeInstanceOf(PermissionError)
  })

  it('an admin cannot revoke themselves', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: superAdmin, error: null }) as any)
    await expect(revokeUser(superAdmin, superAdmin.id)).rejects.toBeInstanceOf(ValidationError)
  })

  it('cannot revoke the last active admin', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: otherAdmin, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: otherAdmin, error: null }) as any) // isLastActiveAdmin: getProfileById
      .mockReturnValueOnce(makeClient({ data: [otherAdmin], error: null }) as any) // isLastActiveAdmin: listProfiles
    await expect(revokeUser(superAdmin, otherAdmin.id)).rejects.toBeInstanceOf(ValidationError)
  })

  it('revokes and audits user.revoke for a valid target', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any) // isLastActiveAdmin short-circuits (not admin)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // profile update for status
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // disablePersonasForProfile
    await revokeUser(superAdmin, targetTutor.id)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.revoke', entity_type: 'profile', entity_id: 'teach-1',
    })
  })
})

describe('restoreUser', () => {
  it('rejects a sub_admin restoring an admin-tier account', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: { id: 'admin-2', role: 'admin', status: 'disabled' }, error: null }) as any,
    )
    await expect(restoreUser(subAdmin, 'admin-2')).rejects.toBeInstanceOf(PermissionError)
  })

  it('restores and audits user.restore', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any) // select role + update status (same client)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // restorePersonasForProfile
    await restoreUser(superAdmin, targetTutor.id)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.restore', entity_type: 'profile', entity_id: 'teach-1',
    })
  })
})

describe('editUser', () => {
  it('edits profile details and audits user.edit — role is a fixed identity and never touched', async () => {
    const updateClient = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: targetTutor, error: null }) as any) // requireManageableTarget -> getProfileById
      .mockReturnValueOnce(updateClient as any) // profiles update
    await editUser(superAdmin, targetTutor.id, { full_name: 'New name' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.edit', entity_type: 'profile', entity_id: 'teach-1',
    })
    // No identity change => no persona/mentorship sync at all.
    expect(updateClient.from).toHaveBeenCalledWith('profiles')
    expect(updateClient.from).not.toHaveBeenCalledWith('persona_assignments')
    expect(updateClient.from).not.toHaveBeenCalledWith('mentorships')
  })
})

describe('countPeople', () => {
  it('runs three head-only counts and returns them by kind, defaulting a null count to 0', async () => {
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 42 })) // students
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 6 })) // tutors
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: null })), // pending
    }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await expect(countPeople()).resolves.toEqual({ students: 42, tutors: 6, pending: 0 })
  })
})

describe('countUsersHubStats', () => {
  it('runs three head-only counts (students/tutors/admin-tier)', async () => {
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 120 })) // students
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 15 })) // tutors
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 3 })), // admin tier
    }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await expect(countUsersHubStats()).resolves.toEqual({ students: 120, tutors: 15, adminTier: 3 })
  })
})

describe('listProfilesByRole', () => {
  it('requests the correct range for the given page/pageSize', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 45 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 3, pageSize: 20 })
    const builder = client.from.mock.results[0].value
    // page 3, pageSize 20 -> rows 40..59
    expect(builder.range).toHaveBeenCalledWith(40, 59)
    expect(builder.eq).toHaveBeenCalledWith('role', 'student')
  })

  it('uses .in() for a multi-role tab (e.g. the admin tier)', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 2 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole(['admin', 'sub_admin'], { page: 1, pageSize: 20 })
    const builder = client.from.mock.results[0].value
    expect(builder.in).toHaveBeenCalledWith('role', ['admin', 'sub_admin'])
    expect(builder.eq).not.toHaveBeenCalled()
  })

  it('returns the page of rows plus the true total (not the page size)', async () => {
    const rows = [{ id: '1' }, { id: '2' }]
    const client = { from: vi.fn(() => queryBuilder({ data: rows, error: null, count: 45 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    const result = await listProfilesByRole('student', { page: 1, pageSize: 20 })
    expect(result).toEqual({ items: rows, total: 45 })
  })

  it('applies a status filter when given', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, status: 'pending' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('searches name OR email via .or(), ignoring blank/whitespace-only search', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, search: 'sara' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).toHaveBeenCalledWith('full_name.ilike.%sara%,email.ilike.%sara%')

    const client2 = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client2 as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, search: '   ' })
    const builder2 = client2.from.mock.results[0].value
    expect(builder2.or).not.toHaveBeenCalled()
  })

  it('escapes ilike wildcard characters in search input', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, search: '50%_off' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).toHaveBeenCalledWith('full_name.ilike.%50\\%\\_off%,email.ilike.%50\\%\\_off%')
  })

  it('applies sortBy mapping: name -> full_name, email -> email, created_at -> created_at', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, sortBy: 'name', sortOrder: 'asc' })
    const builder = client.from.mock.results[0].value
    expect(builder.order).toHaveBeenCalledWith('full_name', { ascending: true })
  })

  it('defaults to sortBy=created_at, sortOrder=desc when not given', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20 })
    const builder = client.from.mock.results[0].value
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('applies sortOrder mapping: asc -> true, desc -> false', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listProfilesByRole('student', { page: 1, pageSize: 20, sortBy: 'email', sortOrder: 'desc' })
    const builder = client.from.mock.results[0].value
    expect(builder.order).toHaveBeenCalledWith('email', { ascending: false })
  })
})

describe('self-service settings writes', () => {
  it('updateOwnProfile writes through the RLS-scoped server client and audits', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await updateOwnProfile(selfActor, { full_name: 'New Name' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'self-1', action: 'profile.update', entity_type: 'profile', entity_id: 'self-1',
    })
  })

  it('changeOwnPassword uses the auth client in real mode and audits', async () => {
    vi.mocked(isMock).mockReturnValueOnce(false as any)
    const updateUser = vi.fn(async () => ({ data: {}, error: null }))
    vi.mocked(createClient).mockResolvedValueOnce({ auth: { updateUser } } as any)
    await changeOwnPassword(selfActor, 'new-password-123')
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'self-1', action: 'profile.password', entity_type: 'profile', entity_id: 'self-1',
    })
  })

  it('changeOwnPassword uses the profile row in mock mode and audits', async () => {
    vi.mocked(isMock).mockReturnValueOnce(true as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await changeOwnPassword(selfActor, 'mock-password')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'self-1', action: 'profile.password', entity_type: 'profile', entity_id: 'self-1',
    })
  })
})

describe('completePasswordRegistration', () => {
  it('returns a uniform invalid error when no active registration target exists', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(
      completePasswordRegistration({ email: 'missing@x.c', code: '12345678', password: 'password123' }),
    ).resolves.toEqual({
      error: "That email or code isn't valid, or the account is already set up.",
      code: ERROR_CODES.invalidInput,
    })
  })

  it('returns a uniform invalid error when the setup code is invalid', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({
        data: {
          id: 'profile-1',
          auth_user_id: null,
          status: 'active',
          setup_code_hash: 'hash',
          setup_code_expires_at: '2099-01-01T00:00:00.000Z',
        },
        error: null,
      }) as any,
    )
    vi.mocked(setupCodeValid).mockReturnValueOnce(false as any)
    await expect(
      completePasswordRegistration({ email: 'student@x.c', code: 'bad-code', password: 'password123' }),
    ).resolves.toEqual({
      error: "That email or code isn't valid, or the account is already set up.",
      code: ERROR_CODES.invalidInput,
    })
  })

  it('creates and binds an auth user for a valid registration', async () => {
    const createUser = vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null }))
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(
        makeClient({
          data: {
            id: 'profile-1',
            auth_user_id: null,
            status: 'active',
            setup_code_hash: 'hash',
            setup_code_expires_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce({ auth: { admin: { createUser, deleteUser: vi.fn() } } } as any)
      .mockReturnValueOnce(makeClient({ data: { id: 'profile-1' }, error: null }) as any)

    await expect(
      completePasswordRegistration({ email: 'Student@x.c', code: 'valid-code', password: 'password123' }),
    ).resolves.toEqual({ ok: true })
    expect(createUser).toHaveBeenCalledWith({
      email: 'student@x.c',
      password: 'password123',
      email_confirm: true,
    })
  })

  it('deletes the orphaned auth user when binding loses a race', async () => {
    const createUser = vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null }))
    const deleteUser = vi.fn(async () => ({ data: {}, error: null }))
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(
        makeClient({
          data: {
            id: 'profile-1',
            auth_user_id: null,
            status: 'active',
            setup_code_hash: 'hash',
            setup_code_expires_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce({ auth: { admin: { createUser, deleteUser } } } as any)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any)

    await expect(
      completePasswordRegistration({ email: 'student@x.c', code: 'valid-code', password: 'password123' }),
    ).resolves.toEqual({
      error: 'This account was just set up by someone else.',
      code: ERROR_CODES.invalidInput,
    })
    expect(deleteUser).toHaveBeenCalledWith('auth-1')
  })
})
