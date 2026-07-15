import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { createAssignment, archiveAssignment, editAssignment } from '@/lib/services/assignments'
import { PermissionError, NotFoundError } from '@/lib/errors'

const actor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const assignmentRow = {
  id: 'a-1', class_id: 'class-1', title: 'HW', description: null, due_date: '2026-07-20T00:00:00.000Z',
  attachment_drive_link: null, topic: null, max_marks: 100, created_by: 'teacher-1', status: 'active', created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createAssignment', () => {
  it('rejects a caller who cannot manage the class, without a DB write or audit', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      createAssignment(actor, { class_id: 'class-1', title: 'x', description: null, due_date: 't' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits assignment.create for a manager (explicit gate — RLS alone was the prior guard)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    const created = await createAssignment(actor, { class_id: 'class-1', title: 'HW', description: null, due_date: 't' })
    expect(created.id).toBe('a-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'assignment.create', entity_type: 'assignment', entity_id: 'a-1',
    })
  })
})

describe('archiveAssignment / editAssignment', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(archiveAssignment(actor, 'missing', 'archived')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageClass).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(archiveAssignment(actor, 'a-1', 'archived')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('archive audits assignment.archive, restore audits assignment.restore', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAssignment(actor, 'a-1', 'archived')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'assignment.archive', entity_type: 'assignment', entity_id: 'a-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAssignment(actor, 'a-1', 'active')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'assignment.restore', entity_type: 'assignment', entity_id: 'a-1',
    })
  })

  it('edit audits assignment.edit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await editAssignment(actor, 'a-1', { title: 'New' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'assignment.edit', entity_type: 'assignment', entity_id: 'a-1',
    })
  })
})
