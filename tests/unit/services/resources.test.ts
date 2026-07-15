import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { createLinkResource, archiveResource } from '@/lib/services/resources'
import { PermissionError, NotFoundError } from '@/lib/errors'

const actor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const resourceRow = { id: 'res-1', class_id: 'class-1', title: 'Notes', drive_link: 'https://x', uploaded_by: 'teacher-1', status: 'active', created_at: 't' }

beforeEach(() => vi.resetAllMocks())

describe('createLinkResource', () => {
  it('rejects a non-manager without touching the database or the audit log', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      createLinkResource(actor, { class_id: 'class-1', title: 'x', drive_link: 'https://x' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates the resource and audits it for a manager', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)
    const created = await createLinkResource(actor, { class_id: 'class-1', title: 'Notes', drive_link: 'https://x' })
    expect(created.id).toBe('res-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1',
      action: 'resource.create',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})

describe('archiveResource', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(archiveResource(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageClass).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(archiveResource(actor, 'res-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('archives and audits for a manager', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveResource(actor, 'res-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1',
      action: 'resource.delete',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})
