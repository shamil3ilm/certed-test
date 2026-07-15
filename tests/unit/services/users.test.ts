import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/auth/setupCode', () => ({
  generateSetupCode: vi.fn(() => 'ABCD1234'),
  hashSetupCode: vi.fn(() => 'hashed'),
  setupCodeExpiry: vi.fn(() => '2099-01-01T00:00:00.000Z'),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { addUser, revokeUser, restoreUser, editUser } from '@/lib/services/users'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'

const superAdmin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const subAdmin = { id: 'sub-1', email: 'sub@x.c', role: 'sub_admin', status: 'active' } as any
const otherAdmin = { id: 'admin-2', email: 'a2@x.c', role: 'admin', status: 'active' } as any
const targetTeacher = { id: 'teach-1', email: 't@x.c', full_name: null, role: 'teacher', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('addUser', () => {
  it('rejects a sub_admin trying to add an admin-tier account, without any DB call', async () => {
    await expect(
      addUser(subAdmin, { email: 'new@x.c', role: 'admin' } as any),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects adding a user whose email already exists', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any)
    await expect(
      addUser(superAdmin, { email: 'exists@x.c', role: 'teacher' } as any),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('creates and audits user.add for a valid add', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // getProfileByEmail: no existing
      .mockReturnValueOnce(makeClient({ data: { id: 'new-1', email: 'new@x.c', role: 'teacher', status: 'active' }, error: null }) as any)
    const { profile, code } = await addUser(superAdmin, { email: 'new@x.c', role: 'teacher' } as any)
    expect(profile.id).toBe('new-1')
    expect(code).toBe('ABCD1234')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.add', entity_type: 'profile', entity_id: 'new-1',
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
      .mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any) // isLastActiveAdmin short-circuits (not admin)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // the actual update
    await revokeUser(superAdmin, targetTeacher.id)
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
      .mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreUser(superAdmin, targetTeacher.id)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.restore', entity_type: 'profile', entity_id: 'teach-1',
    })
  })
})

describe('editUser', () => {
  it('a sub_admin cannot promote a user into the admin tier', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any)
    await expect(editUser(subAdmin, targetTeacher.id, { role: 'admin' } as any)).rejects.toBeInstanceOf(PermissionError)
  })

  it('edits and audits user.edit for a valid change', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any) // requireManageableTarget
      .mockReturnValueOnce(makeClient({ data: targetTeacher, error: null }) as any) // isLastActiveAdmin: getProfileById (short-circuits, not admin)
      .mockReturnValueOnce(makeClient({ data: null, error: null }) as any) // update
    await editUser(superAdmin, targetTeacher.id, { full_name: 'New name' } as any)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'user.edit', entity_type: 'profile', entity_id: 'teach-1',
    })
  })
})
