import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ assertClassActive: vi.fn() }))
// The tutor-only write scope, mirroring the teaches_class_write RLS behind these
// writes. It replaced canManageScope, which admitted a mentor the DB then refused.
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { canWriteClass } from '@/lib/permission/class-write'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import {
  createAnnouncement,
  createAnnouncementFromActionInput,
  archiveAnnouncement,
  restoreAnnouncement,
  editAnnouncement,
  editAnnouncementFromActionInput,
  getLatestAnnouncementForClasses,
  listAnnouncementsForClassPage,
  validateCreateAnnouncementInput,
  validateEditAnnouncementInput,
} from '@/lib/services/announcements'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const announcementRow = {
  id: 'ann-1',
  class_id: 'class-1',
  title: 'Hi',
  message: 'msg',
  author_id: 'tutor-1',
  status: 'active',
  created_at: 't',
}
const extras = { attachments: [], publish_at: null, expires_at: null }

beforeEach(() => vi.resetAllMocks())

describe('createAnnouncement', () => {
  it('rejects a caller who cannot manage the scope, without a DB write or audit', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createAnnouncement(actor, { class_id: 'class-1', title: 'x', message: 'y', ...extras }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits for a manager', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    const created = await createAnnouncement(actor, { class_id: 'class-1', title: 'Hi', message: 'msg', ...extras })
    expect(created.id).toBe('ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'announcement.create',
      entity_type: 'announcement',
      entity_id: 'ann-1',
    })
  })

  it('a global (null class_id) post is admin-only — a tutor is rejected', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      createAnnouncement(actor, { class_id: null, title: 'x', message: 'y', ...extras }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(canWriteClass).toHaveBeenCalledWith(actor, null)
  })
})

describe('validateCreateAnnouncementInput', () => {
  it('normalizes a blank class id to academy-wide scope and trims fields', () => {
    expect(
      validateCreateAnnouncementInput({
        class_id: '',
        title: ' Welcome ',
        message: ' Hello everyone ',
      }),
    ).toEqual({
      class_id: null,
      title: 'Welcome',
      message: 'Hello everyone',
      attachments: [],
      publish_at: null,
      expires_at: null,
    })
  })

  it('parses attachment links (one per line) and publish/expiry dates', () => {
    const result = validateCreateAnnouncementInput({
      class_id: '',
      title: 'x',
      message: 'y',
      attachments: 'https://drive.google.com/file/d/1/view\n\nhttps://example.com/a.pdf',
      publish_at: '2026-08-10',
      expires_at: '2026-08-20',
    })
    expect(result.attachments).toEqual([
      { url: 'https://drive.google.com/file/d/1/view' },
      { url: 'https://example.com/a.pdf' },
    ])
    expect(result.publish_at).toBe('2026-08-10T00:00:00.000Z')
    expect(result.expires_at).toBe('2026-08-20T23:59:59.999Z')
  })

  it('rejects an expiry that is not after the publish date', () => {
    expect(() =>
      validateCreateAnnouncementInput({
        class_id: '',
        title: 'x',
        message: 'y',
        publish_at: '2026-08-20',
        expires_at: '2026-08-10',
      }),
    ).toThrow(ValidationError)
  })

  it('rejects an invalid attachment link', () => {
    expect(() =>
      validateCreateAnnouncementInput({ class_id: '', title: 'x', message: 'y', attachments: 'not-a-link' }),
    ).toThrow(ValidationError)
  })

  it('rejects invalid create payloads with a typed validation error', () => {
    expect(() =>
      validateCreateAnnouncementInput({
        class_id: 'bad-id',
        title: '',
        message: '',
      }),
    ).toThrow(ValidationError)
  })
})

describe('createAnnouncementFromActionInput', () => {
  it('creates from action payload after service-side normalization', async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...announcementRow, id: 'ann-2', class_id: null }, error: null }) as any,
    )
    const created = await createAnnouncementFromActionInput(actor, {
      class_id: '',
      title: ' Welcome ',
      message: ' Hello everyone ',
    })
    expect(created.id).toBe('ann-2')
    expect(created.class_id).toBeNull()
  })
})

describe('validateEditAnnouncementInput', () => {
  it('returns a typed edit patch for valid action input', () => {
    expect(
      validateEditAnnouncementInput({
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: ' Updated ',
        message: ' Refined ',
      }),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      patch: {
        title: 'Updated',
        message: 'Refined',
        attachments: [],
        publish_at: null,
        expires_at: null,
      },
    })
  })

  it('rejects invalid edit payloads with a typed validation error', () => {
    expect(() =>
      validateEditAnnouncementInput({
        id: 'bad-id',
        title: ' ',
        message: ' ',
      }),
    ).toThrow(ValidationError)
  })
})

describe('archiveAnnouncement / restoreAnnouncement / editAnnouncement', () => {
  it('each throws NotFoundError for a missing id, without a permission check', async () => {
    for (const fn of [
      () => archiveAnnouncement(actor, 'missing'),
      () => restoreAnnouncement(actor, 'missing'),
      () => editAnnouncement(actor, 'missing', { title: 't', message: 'm', ...extras }),
    ]) {
      vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
      await expect(fn()).rejects.toBeInstanceOf(NotFoundError)
    }
    expect(canWriteClass).not.toHaveBeenCalled()
  })

  it('each rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(archiveAnnouncement(actor, 'ann-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('archive writes announcement.archive after checking manageability', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'ann-1' }], error: null }) as any)
    await archiveAnnouncement(actor, 'ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'announcement.archive',
      entity_type: 'announcement',
      entity_id: 'ann-1',
    })
  })

  it('restore writes announcement.restore', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'ann-1' }], error: null }) as any)
    await restoreAnnouncement(actor, 'ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'announcement.restore',
      entity_type: 'announcement',
      entity_id: 'ann-1',
    })
  })

  it('edit writes announcement.edit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'ann-1' }], error: null }) as any)
    await editAnnouncement(actor, 'ann-1', { title: 'New', message: 'New msg', ...extras })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'announcement.edit',
      entity_type: 'announcement',
      entity_id: 'ann-1',
    })
  })

  it('editAnnouncementFromActionInput validates and delegates to the edit flow', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canWriteClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ id: 'ann-1' }], error: null }) as any)
    await editAnnouncementFromActionInput(actor, {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: ' Updated ',
      message: ' Refined ',
    })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'announcement.edit',
      entity_type: 'announcement',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})

describe('getLatestAnnouncementForClasses', () => {
  it('returns the newest across class-scoped and global posts, ignoring archived ones', async () => {
    const older = { ...announcementRow, id: 'a', created_at: '2026-01-01T00:00:00.000Z' }
    const newerArchived = {
      ...announcementRow,
      id: 'b',
      class_id: null,
      status: 'archived',
      created_at: '2026-03-01T00:00:00.000Z',
    }
    const newerActive = { ...announcementRow, id: 'c', class_id: null, created_at: '2026-02-01T00:00:00.000Z' }
    // getLatestAnnouncementForClasses builds `global` before `forClasses`.
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [newerArchived, newerActive], error: null })) // global
        .mockReturnValueOnce(queryBuilder({ data: [older], error: null })), // forClasses
    }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await getLatestAnnouncementForClasses(['class-1'])
    expect(result?.id).toBe('c')
  })

  it('returns null when nothing matches', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await expect(getLatestAnnouncementForClasses([])).resolves.toBeNull()
  })
})

describe('listAnnouncementsForClassPage', () => {
  it('merges class + global posts, sorts newest-first, and slices to the requested page', async () => {
    const p1 = { ...announcementRow, id: 'p1', created_at: '2026-01-04T00:00:00.000Z' }
    const p2 = { ...announcementRow, id: 'p2', created_at: '2026-01-02T00:00:00.000Z' }
    const g1 = { ...announcementRow, id: 'g1', class_id: null, created_at: '2026-01-03T00:00:00.000Z' }
    // Call order: forClass, global, forClassCount, globalCount.
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(queryBuilder({ data: [p1, p2], error: null })) // forClass
        .mockReturnValueOnce(queryBuilder({ data: [g1], error: null })) // global
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 2 })) // forClassCount
        .mockReturnValueOnce(queryBuilder({ data: [], error: null, count: 1 })), // globalCount
    }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listAnnouncementsForClassPage('class-1', { page: 1, pageSize: 2 })
    expect(result.items.map((a) => a.id)).toEqual(['p1', 'g1'])
    expect(result.total).toBe(3)
  })

  it('requests page 2 as the next pageSize-worth of rows from each source', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listAnnouncementsForClassPage('class-1', { page: 2, pageSize: 10 })
    const forClassBuilder = client.from.mock.results[0].value
    expect(forClassBuilder.limit).toHaveBeenCalledWith(20) // page * pageSize
  })

  it('applies a title-or-message search clause to every source and count query, escaping wildcards', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listAnnouncementsForClassPage('class-1', { page: 1, pageSize: 10, search: '50%_off' })
    for (const result of client.from.mock.results) {
      expect(result.value.or).toHaveBeenCalledWith('title.ilike.%50\\%\\_off%,message.ilike.%50\\%\\_off%')
    }
  })

  it('skips the search clause when blank', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listAnnouncementsForClassPage('class-1', { page: 1, pageSize: 10, search: '   ' })
    for (const result of client.from.mock.results) {
      expect(result.value.or).not.toHaveBeenCalled()
    }
  })
})
