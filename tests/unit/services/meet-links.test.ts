import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canManageScope: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageScope } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import {
  createMeetLink,
  createMeetLinkFromActionInput,
  deleteMeetLink,
  restoreMeetLink,
  listMeetLinksForClasses,
  validateCreateMeetLinkInput,
} from '@/lib/services/meet-links'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const linkRow = {
  id: 'link-1', class_id: 'class-1', title: 'Class call', url: 'https://meet.example/x',
  description: null, active: true, created_by: 'tutor-1', created_at: 't',
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
      actor_id: 'tutor-1', action: 'meet.create', entity_type: 'meet_link', entity_id: 'link-1',
    })
  })
})

describe('validateCreateMeetLinkInput', () => {
  it('normalizes a global class selection to a null class scope', () => {
    expect(
      validateCreateMeetLinkInput({
        classId: 'global',
        title: ' Academy call ',
        url: 'https://meet.example/global',
        description: ' Notes ',
      }),
    ).toEqual({
      class_id: null,
      title: 'Academy call',
      url: 'https://meet.example/global',
      description: 'Notes',
    })
  })

  it('rejects invalid meet-link input with a typed validation error', () => {
    expect(() =>
      validateCreateMeetLinkInput({
        classId: 'not-a-uuid',
        title: '',
        url: 'javascript:alert(1)',
        description: null,
      }),
    ).toThrow(ValidationError)
  })
})

describe('createMeetLinkFromActionInput', () => {
  it('creates a global meet link after normalizing the action payload', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...linkRow, class_id: null, id: 'global-1' }, error: null }) as any,
    )

    const created = await createMeetLinkFromActionInput(actor, {
      classId: 'global',
      title: ' Global call ',
      url: 'https://meet.example/global',
      description: ' Shared notes ',
    })

    expect(created.class_id).toBeNull()
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1', action: 'meet.create', entity_type: 'meet_link', entity_id: 'global-1',
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
      actor_id: 'tutor-1', action: 'meet.delete', entity_type: 'meet_link', entity_id: 'link-1',
    })
  })
})

describe('restoreMeetLink', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(restoreMeetLink(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageScope).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without reactivating or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(restoreMeetLink(actor, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('reactivates and audits meet.restore for a manager', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreMeetLink(actor, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1', action: 'meet.restore', entity_type: 'meet_link', entity_id: 'link-1',
    })
  })
})

describe('listMeetLinksForClasses', () => {
  it('merges class-scoped and global links, newest first, capped at limit', async () => {
    const older = { ...linkRow, id: 'a', created_at: '2026-01-01T00:00:00.000Z' }
    const newer = { ...linkRow, id: 'b', class_id: null, created_at: '2026-02-01T00:00:00.000Z' }
    // Query order inside listMeetLinksForClasses builds `global` before
    // `forClasses` (each .from() call fires synchronously at build time).
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [newer], error: null })) // global
        .mockReturnValueOnce(queryBuilder({ data: [older], error: null })), // forClasses
    }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listMeetLinksForClasses(['class-1'], 5)
    expect(result.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
