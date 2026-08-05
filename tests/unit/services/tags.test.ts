import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/documents', () => ({ assertCanDocument: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/resources', () => ({ getResource: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/data/tags', () => ({
  selectAllTags: vi.fn(),
  insertTag: vi.fn(),
  insertEntityTag: vi.fn(),
  deleteEntityTag: vi.fn(),
  selectEntityIdsForTag: vi.fn(),
  selectTagsForEntities: vi.fn(),
  selectTagsForEntity: vi.fn(),
}))

import { canManageClass } from '@/lib/permission'
import { assertCanDocument } from '@/lib/permission/documents'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getResource } from '@/lib/services/resources'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { selectAllTags, insertTag, insertEntityTag, deleteEntityTag } from '@/lib/data/tags'
import { createTag, tagEntity, applyTagByName, untagEntity } from '@/lib/services/tags'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'

const staff = { id: 'tutor-1' } as any
const student = { id: 'stud-1' } as any
beforeEach(() => vi.resetAllMocks())

describe('createTag', () => {
  it('rejects a non-staff actor', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({
      isAdmin: false,
      isTutor: false,
      hasMentorAuthority: false,
    } as any)
    await expect(createTag(student, 'Priority')).rejects.toBeInstanceOf(PermissionError)
    expect(insertTag).not.toHaveBeenCalled()
  })

  it('returns an existing tag case-insensitively instead of duplicating', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isTutor: true } as any)
    vi.mocked(selectAllTags).mockResolvedValueOnce([{ id: 't1', name: 'Priority', color: null }])
    await expect(createTag(staff, ' priority ')).resolves.toEqual({ id: 't1', name: 'Priority', color: null })
    expect(insertTag).not.toHaveBeenCalled()
  })

  it('creates a new tag and audits', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: true } as any)
    vi.mocked(selectAllTags).mockResolvedValueOnce([])
    vi.mocked(insertTag).mockResolvedValueOnce({ id: 't2', name: 'Exam prep', color: 'amber' })
    await createTag(staff, 'Exam prep', 'amber')
    expect(insertTag).toHaveBeenCalledWith({ name: 'Exam prep', color: 'amber', created_by: 'tutor-1' })
    expect(auditPrivilegedAction).toHaveBeenCalledWith(staff, 'tag.create', 'tag', 't2')
  })
})

describe('tagEntity', () => {
  it('rejects tagging a class the actor cannot manage', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(tagEntity(staff, 'class', 'class-1', 't1')).rejects.toBeInstanceOf(PermissionError)
    expect(insertEntityTag).not.toHaveBeenCalled()
  })

  it('attaches + audits for a class the actor manages', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await tagEntity(staff, 'class', 'class-1', 't1')
    expect(insertEntityTag).toHaveBeenCalledWith({
      tag_id: 't1',
      entity_type: 'class',
      entity_id: 'class-1',
      created_by: 'tutor-1',
    })
    expect(auditPrivilegedAction).toHaveBeenCalledWith(staff, 'tag.attach', 'class', 'class-1')
  })

  it('routes a resource tag through canDocument, 404ing a missing document', async () => {
    vi.mocked(getResource).mockResolvedValueOnce(null)
    await expect(tagEntity(staff, 'resource', 'res-1', 't1')).rejects.toBeInstanceOf(NotFoundError)
    expect(assertCanDocument).not.toHaveBeenCalled()
  })
})

describe('applyTagByName + untagEntity', () => {
  it('create-or-get then attach, gated on the entity', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true) // assertCanTagEntity
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isTutor: true } as any) // createTag staff check
    vi.mocked(selectAllTags).mockResolvedValueOnce([{ id: 't1', name: 'Priority', color: null }])
    await applyTagByName(staff, 'class', 'class-1', 'Priority')
    expect(insertEntityTag).toHaveBeenCalledWith(expect.objectContaining({ tag_id: 't1', entity_id: 'class-1' }))
  })

  it('untag detaches + audits', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await untagEntity(staff, 'class', 'class-1', 't1')
    expect(deleteEntityTag).toHaveBeenCalledWith('t1', 'class', 'class-1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith(staff, 'tag.detach', 'class', 'class-1')
  })

  it('rejects an unsupported entity type', async () => {
    await expect(tagEntity(staff, 'widget' as any, 'x', 't1')).rejects.toBeInstanceOf(ValidationError)
  })
})
