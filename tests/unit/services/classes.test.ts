import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { requireActorCapability } from '@/lib/services/authorization'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAudit } from '@/lib/data/audit'
import {
  createClass,
  renameClass,
  renameClassFromActionInput,
  archiveClass,
  archiveClassFromActionInput,
  restoreClass,
  restoreClassFromActionInput,
  countActiveClasses,
  myClassIds,
  myClassScope,
  validateRenameClassInput,
  validateClassIdInput,
} from '@/lib/services/classes'
import { PermissionError, NotFoundError } from '@/lib/errors'

const admin = { id: 'admin-1', email: 'a@x.c', role: 'admin', status: 'active' } as any
const tutor = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const classRow = { id: 'class-1', name: 'Math', status: 'active', created_at: 't' }

// A class is always created FOR a subject (createClass requires it), so the tests pass
// one rather than exercising a shape the domain no longer allows.
const SUBJECT_ID = '3e68ffdc-2b4c-4253-b450-312cc6edd82e'

beforeEach(() => vi.clearAllMocks())

describe('class lifecycle is admin-only', () => {
  it('createClass rejects a non-admin, without a DB write or audit', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(createClass(tutor, 'New class', SUBJECT_ID)).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('renameClass/archiveClass/restoreClass reject a non-admin', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(renameClass(tutor, 'class-1', 'New name')).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(archiveClass(tutor, 'class-1')).rejects.toBeInstanceOf(PermissionError)

    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('Admin only.'))
    await expect(restoreClass(tutor, 'class-1')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('createClass creates and audits class.create for an admin', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: classRow, error: null }) as any)
    const created = await createClass(admin, 'Math', SUBJECT_ID)
    expect(created.id).toBe('class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.create',
      entity_type: 'class',
      entity_id: 'class-1',
    })
  })

  it('archiveClass/restoreClass audit class.archive/class.restore for an admin', async () => {
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'class-1' }], error: null }) as any)
    await archiveClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.archive',
      entity_type: 'class',
      entity_id: 'class-1',
    })

    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'class-1' }], error: null }) as any)
    await restoreClass(admin, 'class-1')
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      action: 'class.restore',
      entity_type: 'class',
      entity_id: 'class-1',
    })
  })

  it('rename/archive against a missing class throws NotFound and does not audit (no false success)', async () => {
    // The UPDATE matches 0 rows (stale/deleted id): the data layer .select()s the
    // row, finds none, and throws NotFound - so auditPrivilegedAction never runs
    // and the caller is not handed a phantom success for a mutation that never happened.
    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as any)
    await expect(renameClass(admin, 'gone', 'New name')).rejects.toBeInstanceOf(NotFoundError)

    vi.mocked(requireActorCapability).mockResolvedValueOnce(undefined)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as any)
    await expect(archiveClass(admin, 'gone')).rejects.toBeInstanceOf(NotFoundError)

    expect(writeAudit).not.toHaveBeenCalled()
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
    // Membership reads are lazy: a caller who holds neither persona never opens a
    // service-role client at all (not merely skipping the query), so no admin
    // client is created here.
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('an admin sees every class they can READ, through their own RLS session', async () => {
    // Deliberately the RLS client, not the service-role one: the Classes list must come
    // from the same gate as the class detail page, or it can offer links the database then
    // refuses to open. A sub_admin hit exactly that on staging - two classes listed, both
    // 404 - because that database predates 0092's widening of teaches_class.
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: true, isTutor: false, isStudent: false } as any)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }) as any,
    )
    expect(await myClassIds(admin)).toEqual(['c1', 'c2'])
    expect(createAdminClient, 'the list must not be built service-role').not.toHaveBeenCalled()
  })
})

/**
 * myClassScope is myClassIds for a QUERY, and the difference is the whole point: for an
 * admin or sub_admin myClassIds() is every class in the academy, and spending that as an
 * `.in()` list puts one uuid per class in a GET URL that grows until the request is
 * rejected. Null says "no class predicate" instead - the same rows, no ceiling.
 *
 * Null is not a widening. `classes_read` is `is_active_admin() OR teaches_class(id) OR
 * is_enrolled(id)` and `teaches_class()` ends in `is_active_sub_admin()`, so both personas
 * already read every class through RLS. For anyone else the ids ARE the scope, and
 * returning null there would show a tutor the whole academy - so that case is asserted
 * just as hard as the academy-wide one.
 */
describe('myClassScope turns an academy-wide scope into "no predicate", not a uuid list', () => {
  it('an admin gets null, and the class ids are never even read', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: true, isSubAdmin: false } as any)
    expect(await myClassScope({ id: 'scope-admin' } as any)).toBeNull()
    // Not merely "the list is not sent" - it is never fetched. A read here would be the
    // academy-wide round trip this exists to remove.
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('a sub_admin gets null too - 0092 widened teaches_class() to them', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce({ isAdmin: false, isSubAdmin: true } as any)
    expect(await myClassScope({ id: 'scope-sub' } as any)).toBeNull()
  })

  it('a TUTOR still gets their own ids - null here would hand them the academy', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({
      isAdmin: false,
      isSubAdmin: false,
      isTutor: true,
      isStudent: false,
    } as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ class_id: 'c1' }], error: null }) as any)
    expect(await myClassScope({ id: 'scope-tutor' } as any)).toEqual(['c1'])
  })
})

describe('class action-input validation', () => {
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
  it('rename/archive/restore action helpers delegate after validation', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockReturnValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000' }], error: null }) as any,
    )
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
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000' }], error: null }) as any,
    )
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
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: '550e8400-e29b-41d4-a716-446655440000' }], error: null }) as any,
    )
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
