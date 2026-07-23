import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  requireAdminPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { loadActivePersonas, hasPersona, requireAdminPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import {
  createClass,
  createClassFromActionInput,
  renameClass,
  renameClassFromActionInput,
  archiveClass,
  archiveClassFromActionInput,
  restoreClass,
  restoreClassFromActionInput,
  countActiveClasses,
  myClassIds,
  validateCreateClassInput,
  validateRenameClassInput,
  validateClassIdInput,
} from '@/lib/services/classes'
import { PermissionError, ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const tutor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const classRow = { id: 'class-1', name: 'Math', status: 'active', created_at: 't' }

beforeEach(() => vi.clearAllMocks())

describe('class lifecycle is admin-only', () => {
  it('createClass rejects a non-admin, without a DB write or audit', async () => {
    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(createClass(tutor, 'New class')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('renameClass/archiveClass/restoreClass reject a non-admin', async () => {
    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(renameClass(tutor, 'class-1', 'New name')).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(archiveClass(tutor, 'class-1')).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireAdminPersona).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(restoreClass(tutor, 'class-1')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('createClass creates and audits class.create for an admin', async () => {
    vi.mocked(requireAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: classRow, error: null }) as any)
    const created = await createClass(admin, 'Math')
    expect(created.id).toBe('class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.create',
      entity_type: 'class',
      entity_id: 'class-1',
    })
  })

  it('archiveClass/restoreClass audit class.archive/class.restore for an admin', async () => {
    vi.mocked(requireAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.archive',
      entity_type: 'class',
      entity_id: 'class-1',
    })

    vi.mocked(requireAdminPersona).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.restore',
      entity_type: 'class',
      entity_id: 'class-1',
    })
  })
})

describe('myClassIds derives membership from explicit personas', () => {
  const guardian = { id: 'guard-1', email: 'g@x.c', role: 'guardian', status: 'active' } as any

  it('a tutor gets the classes they teach', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false, isTutor: true, isStudent: false } as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ class_id: 'c1' }, { class_id: 'c2' }], error: null }) as any,
    )
    expect(await myClassIds(tutor)).toEqual(['c1', 'c2'])
  })

  it('a student gets the classes they are enrolled in', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false, isTutor: false, isStudent: true } as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ class_id: 'c3' }], error: null }) as any)
    expect(await myClassIds({ id: 'stud-1' } as any)).toEqual(['c3'])
  })

  it('a persona that is neither tutor nor student (e.g. guardian) gets no classes and never queries membership', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false, isTutor: false, isStudent: false } as any)
    expect(await myClassIds(guardian)).toEqual([])
    // Regression: old code inferred tutor as !isStudent and would have queried class_tutors.
    // Membership reads are now lazy - a caller who holds neither persona doesn't
    // just skip the query, it never opens a service-role client at all. That is
    // stricter than the old `client.from` check, which had to hand over a client
    // first (and whose unconsumed queue then leaked into the next test).
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('an admin sees every class', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: true, isTutor: false, isStudent: false } as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }) as any,
    )
    expect(await myClassIds(admin)).toEqual(['c1', 'c2'])
  })
})

describe('class action-input validation', () => {
  it('validates and trims class-create input', () => {
    expect(validateCreateClassInput({ name: ' Math ' })).toEqual({ name: 'Math' })
  })

  it('rejects invalid class-create input with a typed validation error', () => {
    expect(() => validateCreateClassInput({ name: '' })).toThrow(ValidationError)
  })

  it('validates rename payloads with id + trimmed name', () => {
    expect(
      validateRenameClassInput({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: ' Physics ',
      }),
    ).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Physics',
    })
  })

  it('validates class-id only payloads for archive and restore', () => {
    expect(validateClassIdInput({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })
})

describe('class action-input delegation', () => {
  it('createClassFromActionInput delegates validated data into createClass', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: classRow, error: null }) as any)
    const created = await createClassFromActionInput(admin, { name: ' Math ' })
    expect(created.id).toBe('class-1')
  })

  it('rename/archive/restore action helpers delegate after validation', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await renameClassFromActionInput(admin, {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: ' Physics ',
    })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'class.rename',
      entity_type: 'class',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await archiveClassFromActionInput(admin, { id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'class.archive',
      entity_type: 'class',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await restoreClassFromActionInput(admin, { id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(writeAudit).toHaveBeenLastCalledWith({
      actor_id: 'admin-1',
      action: 'class.restore',
      entity_type: 'class',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
    })
  })
})

describe('countActiveClasses', () => {
  it('returns the head-count, transferring zero rows', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [], error: null, count: 7 }) as any)
    await expect(countActiveClasses()).resolves.toBe(7)
  })

  it('falls back to 0 when count is null', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [], error: null, count: null }) as any)
    await expect(countActiveClasses()).resolves.toBe(0)
  })
})
