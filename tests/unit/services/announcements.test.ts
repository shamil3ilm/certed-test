import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageScope: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))

import { canManageScope } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/repos/audit'
import { createAnnouncement, archiveAnnouncement, restoreAnnouncement, editAnnouncement } from '@/lib/services/announcements'
import { PermissionError, NotFoundError } from '@/lib/errors'

const actor = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
const announcementRow = {
  id: 'ann-1', class_id: 'class-1', title: 'Hi', message: 'msg',
  author_id: 'teacher-1', status: 'active', created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createAnnouncement', () => {
  it('rejects a caller who cannot manage the scope, without a DB write or audit', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(
      createAnnouncement(actor, { class_id: 'class-1', title: 'x', message: 'y' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits for a manager', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    const created = await createAnnouncement(actor, { class_id: 'class-1', title: 'Hi', message: 'msg' })
    expect(created.id).toBe('ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'announcement.create', entity_type: 'announcement', entity_id: 'ann-1',
    })
  })

  it('a global (null class_id) post is admin-only — a teacher is rejected', async () => {
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(
      createAnnouncement(actor, { class_id: null, title: 'x', message: 'y' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(canManageScope).toHaveBeenCalledWith(actor, null)
  })
})

describe('archiveAnnouncement / restoreAnnouncement / editAnnouncement', () => {
  it('each throws NotFoundError for a missing id, without a permission check', async () => {
    for (const fn of [
      () => archiveAnnouncement(actor, 'missing'),
      () => restoreAnnouncement(actor, 'missing'),
      () => editAnnouncement(actor, 'missing', { title: 't', message: 'm' }),
    ]) {
      vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
      await expect(fn()).rejects.toBeInstanceOf(NotFoundError)
    }
    expect(canManageScope).not.toHaveBeenCalled()
  })

  it('each rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(false)
    await expect(archiveAnnouncement(actor, 'ann-1')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('archive writes announcement.archive after checking manageability', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAnnouncement(actor, 'ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'announcement.archive', entity_type: 'announcement', entity_id: 'ann-1',
    })
  })

  it('restore writes announcement.restore', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreAnnouncement(actor, 'ann-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'announcement.restore', entity_type: 'announcement', entity_id: 'ann-1',
    })
  })

  it('edit writes announcement.edit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: announcementRow, error: null }) as any)
    vi.mocked(canManageScope).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await editAnnouncement(actor, 'ann-1', { title: 'New', message: 'New msg' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teacher-1', action: 'announcement.edit', entity_type: 'announcement', entity_id: 'ann-1',
    })
  })
})
