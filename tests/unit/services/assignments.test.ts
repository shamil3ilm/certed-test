import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import {
  createAssignment,
  createAssignmentFromApiInput,
  archiveAssignment,
  archiveAssignmentFromActionInput,
  editAssignment,
  editAssignmentFromActionInput,
  listAssignments,
  validateCreateAssignmentInput,
  validateArchiveAssignmentInput,
  validateEditAssignmentInput,
} from '@/lib/services/assignments'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const actor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const assignmentRow = {
  id: 'a-1',
  class_id: 'class-1',
  title: 'HW',
  description: null,
  due_date: '2026-07-20T00:00:00.000Z',
  attachment_drive_link: null,
  topic: null,
  max_marks: 100,
  created_by: 'tutor-1',
  status: 'active',
  created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('createAssignment', () => {
  it('rejects a caller who cannot manage the class, without a DB write or audit', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      createAssignment(actor, { class_id: 'class-1', title: 'x', description: null, due_date: 't' }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('creates and audits assignment.create for a manager (explicit gate — RLS alone was the prior guard)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    const created = await createAssignment(actor, {
      class_id: 'class-1',
      title: 'HW',
      description: null,
      due_date: 't',
    })
    expect(created.id).toBe('a-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.create',
      entity_type: 'assignment',
      entity_id: 'a-1',
    })
  })

  it('stamps created_by on the insert (regression: silently dropped in the repos->services move)', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    const client = makeClient({ data: assignmentRow, error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await createAssignment(actor, { class_id: 'class-1', title: 'HW', description: null, due_date: 't' })
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: 'tutor-1' }))
  })
})

describe('createAssignment API-input helpers', () => {
  it('validates API payloads and normalizes the assignment create shape', () => {
    expect(
      validateCreateAssignmentInput({
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Homework',
        description: 'Solve all',
        due_date: '2026-07-20T00:00:00.000Z',
        attachment_drive_link: 'https://example.com/brief',
        topic: 'Chapter 1',
        max_marks: 100,
      }),
    ).toEqual({
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Homework',
      description: 'Solve all',
      due_date: '2026-07-20T00:00:00.000Z',
      attachment_drive_link: 'https://example.com/brief',
      topic: 'Chapter 1',
      max_marks: 100,
    })
  })

  it('rejects invalid create payloads with a typed validation error', () => {
    expect(() =>
      validateCreateAssignmentInput({
        class_id: 'bad',
        title: '',
        due_date: 'bad',
      }),
    ).toThrow(ValidationError)
  })

  it('delegates validated API input into the assignment create flow', async () => {
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    const created = await createAssignmentFromApiInput(actor, {
      class_id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'HW',
      due_date: '2026-07-20T00:00:00.000Z',
    })
    expect(created.id).toBe('a-1')
  })
})

describe('archiveAssignment / editAssignment', () => {
  it('throws NotFoundError for a missing id, without a permission check', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(archiveAssignment(actor, 'missing', 'archived')).rejects.toBeInstanceOf(NotFoundError)
    expect(canManageClass).not.toHaveBeenCalled()
  })

  it('rejects a non-manager without writing or auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(archiveAssignment(actor, 'a-1', 'archived')).rejects.toBeInstanceOf(PermissionError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('archive audits assignment.archive, restore audits assignment.restore', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAssignment(actor, 'a-1', 'archived')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.archive',
      entity_type: 'assignment',
      entity_id: 'a-1',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAssignment(actor, 'a-1', 'active')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.restore',
      entity_type: 'assignment',
      entity_id: 'a-1',
    })
  })

  it('edit audits assignment.edit', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await editAssignment(actor, 'a-1', { title: 'New' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.edit',
      entity_type: 'assignment',
      entity_id: 'a-1',
    })
  })
})

describe('listAssignments', () => {
  it('filters by classIds via .in() when given a set of classes (the grading queue)', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listAssignments({ classIds: ['class-1', 'class-2'] })
    const builder = client.from.mock.results[0].value
    expect(builder.in).toHaveBeenCalledWith('class_id', ['class-1', 'class-2'])
  })
})

describe('assignment action-input helpers', () => {
  it('validates archive payloads from the action layer', () => {
    expect(
      validateArchiveAssignmentInput({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
      }),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'active',
    })
  })

  it('validates edit payloads and normalizes the patch', () => {
    expect(
      validateEditAssignmentInput({
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: ' Homework ',
        description: ' Solve all ',
        due_date: '2026-07-20T00:00:00.000Z',
        attachment_drive_link: 'https://example.com/brief',
      }),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      patch: {
        title: 'Homework',
        description: 'Solve all',
        due_date: '2026-07-20T00:00:00.000Z',
        attachment_drive_link: 'https://example.com/brief',
        topic: null,
        max_marks: null,
      },
    })
  })

  it('rejects invalid edit payloads with a typed validation error', () => {
    expect(() =>
      validateEditAssignmentInput({
        id: 'bad',
        title: '',
        description: '',
        due_date: 'bad',
        attachment_drive_link: 'javascript:alert(1)',
      }),
    ).toThrow(ValidationError)
  })

  it('delegates archive/edit action input through the service boundary', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveAssignmentFromActionInput(actor, {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'archived',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.archive',
      entity_type: 'assignment',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: assignmentRow, error: null }) as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await editAssignmentFromActionInput(actor, {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: ' Homework ',
      description: ' Solve all ',
      due_date: '2026-07-20T00:00:00.000Z',
      attachment_drive_link: 'https://example.com/brief',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'tutor-1',
      action: 'assignment.edit',
      entity_type: 'assignment',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})
