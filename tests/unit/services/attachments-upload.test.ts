import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/attachments', () => ({
  insertPendingAttachment: vi.fn(),
  markAttachmentActive: vi.fn(),
  markAttachmentFailed: vi.fn(),
}))
vi.mock('@/lib/google/drive-storage', () => ({ getDriveStorage: vi.fn() }))

import { insertPendingAttachment, markAttachmentActive, markAttachmentFailed } from '@/lib/data/attachments'
import { getDriveStorage } from '@/lib/google/drive-storage'
import { uploadAttachment } from '@/lib/services/attachments/upload'
import { ValidationError } from '@/lib/errors'

/** A minimally-valid PDF body (real %PDF magic so validation passes). */
function pdfBytes(size = 1000): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7
  return bytes
}

function fakeDrive() {
  return {
    ensureFolderPath: vi.fn().mockResolvedValue('folder-9'),
    createFile: vi.fn().mockResolvedValue({ id: 'drive-42' }),
    getFileStream: vi.fn(),
    deleteFile: vi.fn(),
  }
}

beforeEach(() => vi.resetAllMocks())

describe('uploadAttachment (two-phase commit)', () => {
  it('reserves a pending row, uploads, then marks active', async () => {
    vi.mocked(insertPendingAttachment).mockResolvedValue({
      id: 'att-1',
      status: 'pending',
      original_filename: 'Essay.pdf',
      mime_type: 'application/pdf',
      file_size: 1000,
    } as never)
    const drive = fakeDrive()
    vi.mocked(getDriveStorage).mockReturnValue(drive as never)

    const bytes = pdfBytes()
    const row = await uploadAttachment({
      owner: { kind: 'submission', id: 'sub-1' },
      uploadedBy: 'stu-1',
      filename: 'Essay.pdf',
      mimeType: 'application/pdf',
      bytes,
      now: new Date('2026-08-11T00:00:00Z'),
    })

    expect(insertPendingAttachment).toHaveBeenCalledWith({
      owner: { kind: 'submission', id: 'sub-1' },
      uploadedBy: 'stu-1',
      originalFilename: 'Essay.pdf',
      mimeType: 'application/pdf',
      fileSize: bytes.byteLength,
    })
    // Date-partitioned folder for the owner type (env is the first, env-dependent segment).
    expect((drive.ensureFolderPath.mock.calls[0][0] as string[]).slice(1)).toEqual(['submissions', '2026', '08'])
    // Drive filename is {id}__{sanitized}, stamped with the reconciliation appProperties.
    expect(drive.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'att-1__Essay.pdf',
        folderId: 'folder-9',
        appProperties: expect.objectContaining({ attachmentId: 'att-1' }),
      }),
    )
    expect(markAttachmentActive).toHaveBeenCalledWith('att-1', 'drive-42', 'folder-9')
    expect(markAttachmentFailed).not.toHaveBeenCalled()
    expect(row).toMatchObject({ status: 'active', drive_file_id: 'drive-42', drive_folder_id: 'folder-9' })
  })

  it('marks the row failed and rethrows when Drive rejects the upload', async () => {
    vi.mocked(insertPendingAttachment).mockResolvedValue({ id: 'att-2', status: 'pending' } as never)
    vi.mocked(markAttachmentFailed).mockResolvedValue(undefined)
    const drive = fakeDrive()
    drive.createFile = vi.fn().mockRejectedValue(new Error('drive 500'))
    vi.mocked(getDriveStorage).mockReturnValue(drive as never)
    await expect(
      uploadAttachment({
        owner: { kind: 'resource', id: 'r1' },
        uploadedBy: 't1',
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        bytes: pdfBytes(),
      }),
    ).rejects.toThrow('drive 500')
    expect(markAttachmentFailed).toHaveBeenCalledWith('att-2')
    expect(markAttachmentActive).not.toHaveBeenCalled()
  })

  it('rejects an invalid file before reserving any row', async () => {
    await expect(
      uploadAttachment({
        owner: { kind: 'resource', id: 'r1' },
        uploadedBy: 't1',
        filename: 'malware.exe',
        mimeType: 'application/pdf',
        bytes: pdfBytes(),
      }),
    ).rejects.toThrow(ValidationError)
    expect(insertPendingAttachment).not.toHaveBeenCalled()
    expect(getDriveStorage).not.toHaveBeenCalled()
  })
})
