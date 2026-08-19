import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/documents', () => ({ assertCanDocument: vi.fn() }))
vi.mock('@/lib/permission', () => ({ assertClassActive: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/data/resource-versions', () => ({
  insertVersion: vi.fn(),
  selectVersionByIdAsService: vi.fn(),
  selectVersionsForResource: vi.fn(),
  selectVersionsForResources: vi.fn(),
}))

import { assertCanDocument } from '@/lib/permission/documents'
import { assertClassActive } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/data/audit'
import { insertVersion, selectVersionByIdAsService } from '@/lib/data/resource-versions'
import {
  createDocument,
  editDocument,
  archiveDocument,
  restoreDocument,
  recordDownload,
  restoreDocumentVersion,
  validateCreateDocumentInput,
  validateEditDocumentInput,
  validateResourceIdInput,
  listResourcesPage,
} from '@/lib/services/resources'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const classId = '550e8400-e29b-41d4-a716-446655440000'
const docRow = {
  id: 'res-1',
  class_id: 'class-1',
  title: 'Notes',
  description: null,
  category: 'general_documents',
  subject: null,
  file_type: null,
  drive_link: 'https://x',
  uploaded_by: 'tutor-1',
  download_count: 2,
  visibility: 'class',
  status: 'active',
  created_at: 't',
}
const createInput = {
  class_id: 'class-1',
  title: 'Paper 1',
  drive_link: 'https://drive.google.com/x',
  description: null,
  category: 'question_papers' as const,
  subject: 'Maths',
  file_type: 'PDF',
  visibility: 'class' as const,
}

beforeEach(() => vi.resetAllMocks())

describe('createDocument', () => {
  it('enforces canDocument("upload") with class + visibility, then audits', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any)
    const created = await createDocument(actor, createInput)
    expect(created.id).toBe('res-1')
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'upload', { class_id: 'class-1', visibility: 'class' })
    expect(assertClassActive).toHaveBeenCalledWith('class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.create',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })

  it('rejects when canDocument denies, without touching the DB or audit', async () => {
    vi.mocked(assertCanDocument).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(createDocument(actor, createInput)).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('editDocument', () => {
  const patch = { id: 'res-1', ...createInput }

  it('throws NotFound for a missing id, without a permission check or audit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(editDocument(actor, patch)).rejects.toBeInstanceOf(NotFoundError)
    expect(assertCanDocument).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('enforces canDocument("edit", doc), snapshots the replaced link, and audits', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any) // getResource
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any) // update
    await editDocument(actor, patch) // patch.drive_link !== docRow.drive_link
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'edit', docRow)
    // The prior link is kept in history before the row is overwritten.
    expect(insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ resource_id: 'res-1', drive_link: 'https://x', note: 'Replaced' }),
    )
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.edit',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })

  it('does NOT snapshot a metadata-only edit (link unchanged)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any) // getResource
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any) // update
    await editDocument(actor, { ...patch, drive_link: docRow.drive_link, title: 'Renamed' })
    expect(insertVersion).not.toHaveBeenCalled()
  })

  it('rejects when canDocument denies, without writing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any)
    vi.mocked(assertCanDocument).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(editDocument(actor, patch)).rejects.toBeInstanceOf(PermissionError)
    expect(insertVersion).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('restoreDocumentVersion', () => {
  const version = {
    id: 'ver-1',
    resource_id: 'res-1',
    version_no: 2,
    title: 'Old notes',
    drive_link: 'https://old',
    description: null,
    category: 'general_documents' as const,
    subject: null,
    file_type: null,
    created_by: 'tutor-1',
    note: 'Replaced',
    created_at: 't',
  }

  it('snapshots the current state, applies the version, and audits restore_version', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any) // getResource
    vi.mocked(selectVersionByIdAsService).mockResolvedValueOnce(version as any)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any) // update
    await restoreDocumentVersion(actor, 'res-1', 'ver-1')
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'edit', docRow)
    // Current live state is archived to history before the rollback overwrites it.
    expect(insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ resource_id: 'res-1', drive_link: 'https://x', note: 'Restored v2' }),
    )
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.restore_version',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })

  it('rejects a version id that belongs to a different document', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any)
    vi.mocked(selectVersionByIdAsService).mockResolvedValueOnce({ ...version, resource_id: 'other' } as any)
    await expect(restoreDocumentVersion(actor, 'res-1', 'ver-1')).rejects.toBeInstanceOf(NotFoundError)
    expect(insertVersion).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('archiveDocument / restoreDocument', () => {
  it('archive enforces canDocument("delete") and audits resource.delete', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveDocument(actor, 'res-1')
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'delete', docRow)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.delete',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })

  it('restore checks class-active and audits resource.restore', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreDocument(actor, 'res-1')
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'edit', docRow)
    expect(assertClassActive).toHaveBeenCalledWith('class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.restore',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })
})

describe('recordDownload', () => {
  it('enforces canDocument("download"), increments the counter, audits, and returns the doc', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: docRow, error: null }) as any) // getResource
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: { download_count: 2 }, error: null }) as any)
    const doc = await recordDownload(actor, 'res-1')
    expect(doc.id).toBe('res-1')
    expect(assertCanDocument).toHaveBeenCalledWith(actor, 'download', docRow)
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'resource.download',
      entity_type: 'resource',
      entity_id: 'res-1',
    })
  })

  it('rejects a denied download before incrementing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...docRow, visibility: 'staff' }, error: null }) as any,
    )
    vi.mocked(assertCanDocument).mockRejectedValueOnce(new PermissionError('staff only'))
    await expect(recordDownload(actor, 'res-1')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe('validateCreateDocumentInput / validateEditDocumentInput', () => {
  it('normalizes a valid create payload', () => {
    expect(
      validateCreateDocumentInput({
        classId,
        title: ' Paper 1 ',
        url: 'https://drive.google.com/x',
        category: 'question_papers',
        subject: ' Maths ',
        visibility: 'staff',
      }),
    ).toEqual({
      class_id: classId,
      title: 'Paper 1',
      drive_link: 'https://drive.google.com/x',
      description: null,
      category: 'question_papers',
      subject: 'Maths',
      file_type: null,
      visibility: 'staff',
    })
  })

  it('rejects an unknown category (no custom categories)', () => {
    expect(() => validateCreateDocumentInput({ classId, title: 'x', url: 'https://x', category: 'made_up' })).toThrow(
      ValidationError,
    )
  })

  it('rejects a non-http link', () => {
    expect(() =>
      validateEditDocumentInput({ id: classId, title: 'x', url: 'javascript:alert(1)', category: 'general_documents' }),
    ).toThrow(ValidationError)
  })

  it('rejects a valid http link that is not a Google Drive/Docs host', () => {
    expect(() =>
      validateCreateDocumentInput({
        classId,
        title: 'x',
        url: 'https://evil.example.com/x',
        category: 'general_documents',
      }),
    ).toThrow(ValidationError)
  })

  it('treats an EMPTY link as optional (null), not an error - a link can be cleared', () => {
    expect(
      validateEditDocumentInput({ id: classId, title: 'Paper 1', url: '', category: 'general_documents' }),
    ).toMatchObject({ drive_link: null })
  })

  it('treats a MISSING link as optional (null) on create', () => {
    expect(validateCreateDocumentInput({ classId, title: 'Paper 1', category: 'general_documents' })).toMatchObject({
      drive_link: null,
    })
  })

  it('still enforces the Drive host when a link IS provided', () => {
    expect(() =>
      validateEditDocumentInput({
        id: classId,
        title: 'x',
        url: 'https://evil.example.com/x',
        category: 'general_documents',
      }),
    ).toThrow(ValidationError)
  })
})

describe('listResourcesPage filters', () => {
  it('filters class/status/category and requests the right range', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 25 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listResourcesPage('class-1', {
      page: 2,
      pageSize: 10,
      category: 'practice_sheets',
    })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('class_id', 'class-1')
    expect(builder.eq).toHaveBeenCalledWith('status', 'active')
    expect(builder.eq).toHaveBeenCalledWith('category', 'practice_sheets')
    expect(builder.range).toHaveBeenCalledWith(10, 19)
    expect(result.total).toBe(25)
  })

  it('searches title/description/subject and escapes wildcards', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listResourcesPage('class-1', { page: 1, pageSize: 10, search: '50%_off' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).toHaveBeenCalledWith(
      'title.ilike.%50\\%\\_off%,description.ilike.%50\\%\\_off%,subject.ilike.%50\\%\\_off%',
    )
  })

  it('sorts oldest-first when requested', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listResourcesPage('class-1', { page: 1, pageSize: 10, sort: 'oldest' })
    const builder = client.from.mock.results[0].value
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

describe('validateResourceIdInput', () => {
  it('accepts a uuid and rejects garbage', () => {
    expect(validateResourceIdInput({ id: classId })).toBe(classId)
    expect(() => validateResourceIdInput({ id: 'bad' })).toThrow(ValidationError)
  })
})
