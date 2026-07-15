import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageScope: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageScope } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { createMeetLink, deleteMeetLink } from '@/lib/services/meetLinks'
import { PermissionError, NotFoundError } from '@/lib/errors'

const actor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const linkRow = {
  id: 'link-1', class_id: 'class-1', title: 'Class call', url: 'https://meet.example/x',
  description: null, active: true, created_by: 'teacher-1', created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createMeetLink', () => {
  it('rejects a caller who cannot manage the scope, without a DB write or audit', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(
      createMeetLink(actor, { class_id: 'class-1', title: 'x', url: 'https://y' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits meet.create for a manager (previously unaudited)', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    const created = await createMeetLink(actor, { class_id: 'class-1', title: 'Class call', url: 'https://meet.example/x' })
    expect(created.id).toBe('link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'meet.create', entity_type: 'meet_link', entity_id: 'link-1',
    })
  })
})

describe('deleteMeetLink', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deleteMeetLink(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageScope).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without deactivating or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(deleteMeetLink(actor, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('deactivates and audits meet.delete for a manager (previously unaudited)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await deleteMeetLink(actor, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'meet.delete', entity_type: 'meet_link', entity_id: 'link-1',
    })
  })
})
