import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/permission', () => ({ canAccessClass: vi.fn(), canManageClass: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessClass, canManageClass } from '@/lib/permission'
import { assertCanComment } from '@/lib/services/comment-auth'
import { NotFoundError, PermissionError } from '@/lib/errors'

const student = { id: 'stud-1', role: 'student', status: 'active' } as any
const tutor = { id: 'teach-1', role: 'tutor', status: 'active' } as any

/** An admin client whose `.from(table)` yields a per-table result. Each
 *  data-layer lookup opens its own client, so the submission -> assignment
 *  two-step queues one of these per step; keying by table keeps each step's
 *  expected row readable at the call site. */
function tableClient(byTable: Record<string, { data: unknown; error: unknown }>) {
  return { from: vi.fn((t: string) => queryBuilder(byTable[t] ?? { data: null, error: null })) } as any
}

beforeEach(() => vi.clearAllMocks())

describe('assertCanComment - resource / meet (class membership)', () => {
  it('allows a class member to comment on a resource', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      tableClient({ resources: { data: { class_id: 'c1' }, error: null } }),
    )
    vi.mocked(canAccessClass).mockResolvedValueOnce(true)
    await expect(assertCanComment(student, 'resource', 'r1')).resolves.toBeUndefined()
    expect(canAccessClass).toHaveBeenCalledWith(student, 'c1')
  })

  it('rejects a non-member with PermissionError', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      tableClient({ resources: { data: { class_id: 'c1' }, error: null } }),
    )
    vi.mocked(canAccessClass).mockResolvedValueOnce(false)
    await expect(assertCanComment(student, 'resource', 'r1')).rejects.toBeInstanceOf(PermissionError)
  })

  it('404s a missing resource without a membership check', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(tableClient({ resources: { data: null, error: null } }))
    await expect(assertCanComment(student, 'resource', 'gone')).rejects.toBeInstanceOf(NotFoundError)
    expect(canAccessClass).not.toHaveBeenCalled()
  })

  it('allows a global meet (null class) without a membership check', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      tableClient({ meet_links: { data: { class_id: null }, error: null } }),
    )
    await expect(assertCanComment(student, 'meet', 'm1')).resolves.toBeUndefined()
    expect(canAccessClass).not.toHaveBeenCalled()
  })
})

describe('assertCanComment - submission (owner or class tutor/admin, never a classmate)', () => {
  it('allows the owning student on their own submission (no class check)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      tableClient({ submissions: { data: { student_id: 'stud-1', assignment_id: 'a1' }, error: null } }),
    )
    await expect(assertCanComment(student, 'submission', 's1')).resolves.toBeUndefined()
    expect(canManageClass).not.toHaveBeenCalled()
  })

  it('rejects a classmate commenting on a foreign submission', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(tableClient({ submissions: { data: { student_id: 'other', assignment_id: 'a1' }, error: null } }))
      .mockReturnValueOnce(tableClient({ assignments: { data: { class_id: 'c1' }, error: null } }))
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(assertCanComment(student, 'submission', 's1')).rejects.toBeInstanceOf(PermissionError)
  })

  it('allows the class tutor on a student submission', async () => {
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(tableClient({ submissions: { data: { student_id: 'other', assignment_id: 'a1' }, error: null } }))
      .mockReturnValueOnce(tableClient({ assignments: { data: { class_id: 'c1' }, error: null } }))
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await expect(assertCanComment(tutor, 'submission', 's1')).resolves.toBeUndefined()
    expect(canManageClass).toHaveBeenCalledWith(tutor, 'c1')
  })

  it('404s a missing submission', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(tableClient({ submissions: { data: null, error: null } }))
    await expect(assertCanComment(student, 'submission', 'gone')).rejects.toBeInstanceOf(NotFoundError)
  })
})
