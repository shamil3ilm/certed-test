import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/attachments', () => ({
  selectStalePendingAttachmentIds: vi.fn(),
  markAttachmentsFailed: vi.fn(),
  selectLiveAttachmentIds: vi.fn(),
}))
vi.mock('@/lib/google/drive-storage', () => ({ getDriveStorage: vi.fn() }))
vi.mock('@/lib/services/attachments/upload', () => ({ deployEnv: () => 'test-env' }))
vi.mock('@/lib/data/resources', () => ({ deleteStalePendingResources: vi.fn() }))

import { markAttachmentsFailed, selectLiveAttachmentIds, selectStalePendingAttachmentIds } from '@/lib/data/attachments'
import { deleteStalePendingResources } from '@/lib/data/resources'
import { getDriveStorage } from '@/lib/google/drive-storage'
import { reconcileAttachments } from '@/lib/services/attachments/reconcile'

type DriveFile = { id: string; appProperties: Record<string, string> }

function fakeDrive(files: DriveFile[]) {
  const listFilesByAppProperty = vi.fn(async () => files)
  const deleteFile = vi.fn(async () => {})
  vi.mocked(getDriveStorage).mockReturnValue({
    ensureFolderPath: vi.fn(),
    createFile: vi.fn(),
    getFileStream: vi.fn(),
    deleteFile,
    listFilesByAppProperty,
  })
  return { listFilesByAppProperty, deleteFile }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(selectStalePendingAttachmentIds).mockResolvedValue([])
  vi.mocked(selectLiveAttachmentIds).mockResolvedValue(new Set())
  vi.mocked(markAttachmentsFailed).mockResolvedValue(undefined)
  vi.mocked(deleteStalePendingResources).mockResolvedValue(0)
})

describe('reconcileAttachments', () => {
  /**
   * A custodial document is a pending draft until its first file goes live (0113). One whose
   * upload never finished is invisible, but would sit in the table forever - so a day on, the
   * sweep removes it.
   */
  it('deletes document drafts left pending for more than a day, and reports how many', async () => {
    vi.mocked(deleteStalePendingResources).mockResolvedValue(2)
    fakeDrive([])
    const now = new Date('2026-09-14T12:00:00.000Z')

    const result = await reconcileAttachments(now)

    expect(deleteStalePendingResources).toHaveBeenCalledWith('2026-09-13T12:00:00.000Z')
    expect(result.staleDraftDocumentsDeleted).toBe(2)
  })

  it('demotes stale pending rows to failed', async () => {
    vi.mocked(selectStalePendingAttachmentIds).mockResolvedValue(['a1', 'a2'])
    fakeDrive([])

    const result = await reconcileAttachments(new Date('2026-08-11T12:00:00Z'))

    // The cutoff is one hour before `now`.
    expect(selectStalePendingAttachmentIds).toHaveBeenCalledWith('2026-08-11T11:00:00.000Z')
    expect(markAttachmentsFailed).toHaveBeenCalledWith(['a1', 'a2'])
    expect(result.stalePendingFailed).toBe(2)
  })

  it('deletes files whose row is dead, keeps live ones, and skips unstamped files', async () => {
    const drive = fakeDrive([
      { id: 'file-live', appProperties: { attachmentId: 'live-1', env: 'test-env' } },
      { id: 'file-dead', appProperties: { attachmentId: 'dead-1', env: 'test-env' } },
      { id: 'file-nostamp', appProperties: { env: 'test-env' } },
    ])
    vi.mocked(selectLiveAttachmentIds).mockResolvedValue(new Set(['live-1']))

    const result = await reconcileAttachments()

    // Only the dead one is deleted; the live and the unstamped file are left alone.
    expect(drive.deleteFile).toHaveBeenCalledTimes(1)
    expect(drive.deleteFile).toHaveBeenCalledWith('file-dead')
    expect(result.orphanFilesDeleted).toBe(1)
    expect(result.orphanFilesFailed).toBe(0)
    // The liveness lookup only considers files that carry an attachmentId.
    expect(selectLiveAttachmentIds).toHaveBeenCalledWith(['live-1', 'dead-1'])
  })

  it('counts a Drive delete failure without aborting the sweep', async () => {
    const drive = fakeDrive([
      { id: 'file-a', appProperties: { attachmentId: 'dead-a', env: 'test-env' } },
      { id: 'file-b', appProperties: { attachmentId: 'dead-b', env: 'test-env' } },
    ])
    drive.deleteFile.mockRejectedValueOnce(new Error('drive 500'))

    const result = await reconcileAttachments()

    expect(drive.deleteFile).toHaveBeenCalledTimes(2) // did not stop at the first failure
    expect(result.orphanFilesDeleted).toBe(1)
    expect(result.orphanFilesFailed).toBe(1)
  })
})
