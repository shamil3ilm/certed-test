import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ assertClassActive: vi.fn() }))
// The tutor-only write scope, mirroring the teaches_class_write RLS behind these
// writes. It replaced canManageScope, which admitted a mentor the DB then refused.
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyClassRoleBestEffort: vi.fn() }))

import { assertClassActive } from '@/lib/permission'
import { canWriteClass } from '@/lib/permission/class-write'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import {
  listMeetLinks,
  createMeetLink,
  createMeetLinkFromActionInput,
  deleteMeetLink,
  editMeetLinkFromActionInput,
  restoreMeetLink,
  validateCreateMeetLinkInput,
} from '@/lib/services/meet-links'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const linkRow = {
  id: 'link-1',
  class_id: 'class-1',
  title: 'Class call',
  url: 'https://meet.example/x',
  description: null,
  scheduled_at: null,
  active: true,
  created_by: 'tutor-1',
  created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createMeetLink', () => {
  it('rejects a caller who cannot manage the scope, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(createMeetLink(actor, { class_id: 'class-1', title: 'x', url: 'https://y' })).rejects.toBeInstanceOf(
      PermissionError,
    )
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits meet.create for a manager (previously unaudited)', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    const created = await createMeetLink(actor, {
      class_id: 'class-1',
      title: 'Class call',
      url: 'https://meet.example/x',
    })
    expect(created.id).toBe('link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'meet.create',
      entity_type: 'meet_link',
      entity_id: 'link-1',
    })
    // A class meet notifies that class's students, like an announcement.
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', 'students', {
      kind: 'announcement',
      title: 'New meeting: Class call',
      body: 'https://meet.example/x',
      link: '/classroom/class-1',
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
      scheduled_at: null,
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
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
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
      actor_id: 'tutor-1',
      action: 'meet.create',
      entity_type: 'meet_link',
      entity_id: 'global-1',
    })
    // Academy-wide meets are deliberately not fanned out to every account.
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })
})

describe('deleteMeetLink', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deleteMeetLink(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without deactivating or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(deleteMeetLink(actor, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('deactivates and audits meet.delete for a manager (previously unaudited)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'meet-1' }], error: null }) as any)
    await deleteMeetLink(actor, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'meet.delete',
      entity_type: 'meet_link',
      entity_id: 'link-1',
    })
  })
})

describe('restoreMeetLink', () => {
  it('throws NotFoundError for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(restoreMeetLink(actor, 'missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(canWriteClass).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without reactivating or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(restoreMeetLink(actor, 'link-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('reactivates and audits meet.restore for a manager', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'meet-1' }], error: null }) as any)
    await restoreMeetLink(actor, 'link-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'meet.restore',
      entity_type: 'meet_link',
      entity_id: 'link-1',
    })
  })

  it('refuses to restore a link onto an archived class, without reactivating', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: linkRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(assertClassActive).mockRejectedValueOnce(new ValidationError('That class is archived.'))
    await expect(restoreMeetLink(actor, 'link-1')).rejects.toBeInstanceOf(ValidationError)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('editMeetLinkFromActionInput', () => {
  it('updates and audits meet.edit for a manager', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...linkRow, id: VALID_ID }, error: null }) as any,
    ) // getMeetLink
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'meet-1' }], error: null }) as any) // updateMeetLink
    await editMeetLinkFromActionInput(actor, {
      id: VALID_ID,
      title: 'New title',
      url: 'https://meet.example/y',
      description: '',
      scheduled_at: '2026-08-01T10:00:00.000Z',
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'meet.edit',
      entity_type: 'meet_link',
      entity_id: VALID_ID,
    })
  })

  it('rejects a non-manager without updating or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...linkRow, id: VALID_ID }, error: null }) as any,
    )
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      editMeetLinkFromActionInput(actor, {
        id: VALID_ID,
        title: 'x',
        url: 'https://meet.example/y',
        description: '',
        scheduled_at: '',
      }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

/**
 * listMeetLinks must narrow to the class IN THE QUERY, never by reading every link in the
 * academy and keeping the ones that match. Two things break if it does: the request grows
 * with the academy, and the answer depends on PostgREST's row cap - past it, links silently
 * stop appearing on a class page, which reads as "the tutor never posted one" rather than
 * as an error.
 *
 * These assert where the filtering HAPPENS, not just what comes back. A result-shape
 * assertion passes under either implementation, so it cannot protect this property.
 */
describe('listMeetLinks filters in the QUERY, not in memory', () => {
  it('asks the database for this class AND the academy-wide links', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(client as any)

    await listMeetLinks(VALID_ID)

    // Two reads, deliberately: the class's links and the null-class ones. The stub shares
    // one builder across both, so this asserts the SET of filters applied, not "the" key -
    // and the count below is what keeps that honest.
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(builder.eq).toHaveBeenCalledWith('class_id', VALID_ID)
    expect(builder.is).toHaveBeenCalledWith('class_id', null)
    // Bounded, not a bare select: without a ceiling this read is capped silently.
    expect(builder.range).toHaveBeenCalled()
  })

  it('a global listing asks for no class at all, rather than every class', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(client as any)

    await listMeetLinks()

    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.eq).not.toHaveBeenCalledWith('class_id', expect.anything())
    expect(builder.is).not.toHaveBeenCalled()
  })

  it('rejects a malformed class id instead of putting it in a filter', async () => {
    const { client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(client as any)
    await expect(listMeetLinks('not-a-uuid')).rejects.toThrow()
  })
})
