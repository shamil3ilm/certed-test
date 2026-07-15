import { describe, it, expect, vi } from 'vitest'

/**
 * Each test uses a distinct classId/studentId (and a distinct profile id)
 * so results can't collide via canAccessClass/canMentor's per-request
 * React `cache()` memoization (which keys on argument identity/value).
 */
function adminClientReturning(row: unknown) {
  const builder: {
    from: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
  } = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row })),
  }
  return builder
}

// `cache` from 'react' is stubbed globally in vitest.setup.ts (React 18.2.0
// doesn't actually export it — see that file for why).

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { canManageClass, canManageScope, canAccessClass } from '@/lib/permission/class'
import { canMentor } from '@/lib/permission/mentor'

const profile = (overrides: { id: string; role: 'admin' | 'teacher' | 'student' | 'sub_admin' }) =>
  ({ id: overrides.id, email: `${overrides.id}@x.c`, role: overrides.role, status: 'active' }) as any

describe('permission/class', () => {
  it('canManageClass: admin can always manage, without a DB call', async () => {
    expect(await canManageClass(profile({ id: 'admin-cmc-1', role: 'admin' }), 'class-cmc-admin')).toBe(true)
  })

  it('canManageClass: teacher of the class can manage, a teacher not of it cannot', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-1' }) as any)
    expect(await canManageClass(profile({ id: 'teach-cmc-1', role: 'teacher' }), 'class-cmc-yes')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning(null) as any)
    expect(await canManageClass(profile({ id: 'teach-cmc-2', role: 'teacher' }), 'class-cmc-no')).toBe(false)
  })

  it('canManageClass: a student never manages a class, without a DB call', async () => {
    expect(await canManageClass(profile({ id: 'stud-cmc-1', role: 'student' }), 'class-cmc-stud')).toBe(false)
  })

  it('canManageScope: null classId is admin-only, no DB call for non-admin', async () => {
    expect(await canManageScope(profile({ id: 'admin-cms-1', role: 'admin' }), null)).toBe(true)
    expect(await canManageScope(profile({ id: 'teach-cms-1', role: 'teacher' }), null)).toBe(false)
  })

  it('canManageScope: non-null classId delegates to canManageClass', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-2' }) as any)
    expect(await canManageScope(profile({ id: 'teach-cms-2', role: 'teacher' }), 'class-cms-yes')).toBe(true)
  })

  it('canAccessClass: admin always, teacher needs class_teachers membership, student needs enrollment', async () => {
    expect(await canAccessClass(profile({ id: 'admin-cac-1', role: 'admin' }), 'class-cac-admin')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-3' }) as any)
    expect(await canAccessClass(profile({ id: 'teach-cac-1', role: 'teacher' }), 'class-cac-teach-yes')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'en-1' }) as any)
    expect(await canAccessClass(profile({ id: 'stud-cac-1', role: 'student' }), 'class-cac-stud-yes')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning(null) as any)
    expect(await canAccessClass(profile({ id: 'stud-cac-2', role: 'student' }), 'class-cac-stud-no')).toBe(false)
  })
})

describe('permission/mentor', () => {
  it('canMentor: admin always, teacher needs an active mentorship, student never', async () => {
    expect(await canMentor(profile({ id: 'admin-cm-1', role: 'admin' }), 'stud-cm-admin')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ms-1' }) as any)
    expect(await canMentor(profile({ id: 'teach-cm-1', role: 'teacher' }), 'stud-cm-yes')).toBe(true)

    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning(null) as any)
    expect(await canMentor(profile({ id: 'teach-cm-2', role: 'teacher' }), 'stud-cm-no')).toBe(false)

    expect(await canMentor(profile({ id: 'stud-cm-1', role: 'student' }), 'stud-cm-other')).toBe(false)
  })
})
