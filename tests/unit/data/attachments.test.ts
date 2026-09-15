import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  insertPendingAttachment,
  callActivateAttachment,
  markAttachmentFailed,
  selectStalePendingAttachmentIds,
  markAttachmentsFailed,
  countFailedAttachments,
  selectLiveAttachmentIds,
  selectReadableActiveAttachment,
} from '@/lib/data/attachments'

const row = { id: 'att1', status: 'pending' }
const input = {
  owner: { kind: 'submission', id: 'sub1' },
  uploadedBy: 'u1',
  originalFilename: 'hw.pdf',
  mimeType: 'application/pdf',
  fileSize: 100,
} as any

beforeEach(() => vi.resetAllMocks())

describe('attachments data layer', () => {
  it('insertPendingAttachment returns the created row and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: row, error: null }) as any)
    expect(await insertPendingAttachment(input)).toEqual(row)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(insertPendingAttachment(input)).rejects.toThrow(/attachments.insertPending: e/)
  })

  it('callActivateAttachment activates through the guarded function, with the cap it enforces', async () => {
    const client = makeClient({ data: null, error: null }, { data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await expect(callActivateAttachment('att1', 'file', 'folder', 5)).resolves.toEqual({ ok: true, published: false })
    expect(client.rpc).toHaveBeenCalledWith('activate_attachment', {
      p_id: 'att1',
      p_drive_file_id: 'file',
      p_drive_folder_id: 'folder',
      p_max_active: 5,
    })
  })

  it.each(['submission_closed', 'attachment_cap_reached'] as const)(
    'callActivateAttachment reports %s as a refusal, not an error',
    async (reason) => {
      vi.mocked(createAdminClient).mockReturnValueOnce(
        makeClient({ data: null, error: null }, { data: null, error: { message: reason } }) as any,
      )
      await expect(callActivateAttachment('att1', 'f', 'd', 5)).resolves.toEqual({ ok: false, reason })
    },
  )

  it('callActivateAttachment / markAttachmentFailed throw any other failure', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: null }, { data: null, error: { message: 'e' } }) as any,
    )
    await expect(callActivateAttachment('att1', 'f', 'd', 5)).rejects.toThrow(/attachments.activate: e/)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(markAttachmentFailed('att1')).rejects.toThrow(/attachments.markFailed: e/)
  })

  it('selectStalePendingAttachmentIds maps ids and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null }) as any,
    )
    expect(await selectStalePendingAttachmentIds('2026-01-01')).toEqual(['a', 'b'])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectStalePendingAttachmentIds('t')).rejects.toThrow(/attachments.selectStalePending: e/)
  })

  it('markAttachmentsFailed short-circuits on [] and throws on error otherwise', async () => {
    await expect(markAttachmentsFailed([])).resolves.toBeUndefined()
    expect(createAdminClient).not.toHaveBeenCalled()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(markAttachmentsFailed(['a'])).resolves.toBeUndefined()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(markAttachmentsFailed(['a'])).rejects.toThrow(/attachments.markFailed\(bulk\): e/)
  })

  it('countFailedAttachments returns the head count (0 when null)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null, count: 4 }) as any)
    expect(await countFailedAttachments()).toBe(4)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null, count: null }) as any)
    expect(await countFailedAttachments()).toBe(0)
  })

  it('selectLiveAttachmentIds returns an empty Set on [] and a Set of ids otherwise', async () => {
    expect(await selectLiveAttachmentIds([])).toEqual(new Set())
    expect(createAdminClient).not.toHaveBeenCalled()
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null }) as any,
    )
    expect(await selectLiveAttachmentIds(['a', 'b', 'c'])).toEqual(new Set(['a', 'b']))
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectLiveAttachmentIds(['a'])).rejects.toThrow(/attachments.selectLive: e/)
  })

  it('selectReadableActiveAttachment returns the active row via the RLS client, or null', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: row, error: null }) as any)
    expect(await selectReadableActiveAttachment('att1')).toEqual(row)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectReadableActiveAttachment('gone')).toBeNull()
  })
})
