import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import {
  createLinkResource,
  createLinkResourceFromActionInput,
  archiveResource,
  archiveResourceFromActionInput,
  restoreResource,
  restoreResourceFromActionInput,
  listResourcesPage,
  validateCreateLinkResourceInput,
  validateResourceIdInput,
} from '@/lib/services/resources'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const resourceRow = {
  id: 'res-1',
  class_id: 'class-1',
  title: 'Notes',
  drive_link: 'https://x',
  uploaded_by: 'tutor-1',
  status: 'active',
  created_at: 't',
}
const classId = '550e8400-e29b-41d4-a716-446655440000'

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
      actor_id: 'tutor-1',
      action: 'resource.create',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})

describe('validateCreateLinkResourceInput', () => {
  it('trims and maps action input into the resource create shape', () => {
    expect(
      validateCreateLinkResourceInput({
        classId,
        title: ' Notes ',
        url: 'https://example.com/notes',
      }),
    ).toEqual({
      class_id: classId,
      title: 'Notes',
      drive_link: 'https://example.com/notes',
    })
  })

  it('rejects invalid action input with a typed validation error', () => {
    expect(() =>
      validateCreateLinkResourceInput({
        classId: 'bad-id',
        title: '',
        url: 'javascript:alert(1)',
      }),
    ).toThrow(ValidationError)
  })
})

describe('createLinkResourceFromActionInput', () => {
  it('creates a resource after normalizing the action payload', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)

    const created = await createLinkResourceFromActionInput(actor, {
      classId,
      title: ' Notes ',
      url: 'https://example.com/resource',
    })

    expect(created.id).toBe('res-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
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
      actor_id: 'tutor-1',
      action: 'resource.delete',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})

describe('restoreResource', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(restoreResource(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageClass).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(restoreResource(actor, 'res-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('restores and audits resource.restore for a manager', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: resourceRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreResource(actor, 'res-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.restore',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})

describe('listResourcesPage', () => {
  it('filters by class/status and requests the correct range', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 25 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listResourcesPage('class-1', { page: 2, pageSize: 10 })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('class_id', 'class-1')
    expect(builder.eq).toHaveBeenCalledWith('status', 'active')
    expect(builder.range).toHaveBeenCalledWith(10, 19)
    expect(result.total).toBe(25)
  })

  it('filters to archived status when requested', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listResourcesPage('class-1', { page: 1, pageSize: 20, status: 'archived' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('status', 'archived')
  })

  it('applies an ilike title search, escaping wildcards', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listResourcesPage('class-1', { page: 1, pageSize: 10, search: '50%_off' })
    const builder = client.from.mock.results[0].value
    expect(builder.ilike).toHaveBeenCalledWith('title', '%50\\%\\_off%')
  })

  it('skips the search filter when blank', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listResourcesPage('class-1', { page: 1, pageSize: 10, search: '  ' })
    const builder = client.from.mock.results[0].value
    expect(builder.ilike).not.toHaveBeenCalled()
  })
})

describe('resource action-input helpers', () => {
  it('validates resource ids from the action layer', () => {
    expect(validateResourceIdInput({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('rejects invalid resource ids with a typed validation error', () => {
    expect(() => validateResourceIdInput({ id: 'bad' })).toThrow(ValidationError)
  })

  it('delegates archive/restore resource after validation', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({
        data: { ...resourceRow, id: '550e8400-e29b-41d4-a716-446655440000', class_id: classId },
        error: null,
      }) as any,
    )
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveResourceFromActionInput(actor, { id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.delete',
      entity_type: 'resource',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({
        data: { ...resourceRow, id: '550e8400-e29b-41d4-a716-446655440000', class_id: classId },
        error: null,
      }) as any,
    )
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreResourceFromActionInput(actor, { id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.restore',
      entity_type: 'resource',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
