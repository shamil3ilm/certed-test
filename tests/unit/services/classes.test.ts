import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { createClass, renameClass, archiveClass, restoreClass } from '@/lib/services/classes'
import { PermissionError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const teacher = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const classRow = { id: 'class-1', name: 'Math', status: 'active', created_at: 't' }

beforeEach(() => vi.resetAllMocks())

describe('class lifecycle is admin-only', () => {
  it('createClass rejects a non-admin, without a DB write or audit', async () => {
    await expect(createClass(teacher, 'New class')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('renameClass/archiveClass/restoreClass reject a non-admin', async () => {
    await expect(renameClass(teacher, 'class-1', 'New name')).rejects.toBeInstanceOf(PermissionError)
    await expect(archiveClass(teacher, 'class-1')).rejects.toBeInstanceOf(PermissionError)
    await expect(restoreClass(teacher, 'class-1')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('createClass creates and audits class.create for an admin', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: classRow, error: null }) as any)
    const created = await createClass(admin, 'Math')
    expect(created.id).toBe('class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.create', entity_type: 'class', entity_id: 'class-1',
    })
  })

  it('archiveClass/restoreClass audit class.archive/class.restore for an admin', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.archive', entity_type: 'class', entity_id: 'class-1',
    })

    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1', action: 'class.restore', entity_type: 'class', entity_id: 'class-1',
    })
  })
})
