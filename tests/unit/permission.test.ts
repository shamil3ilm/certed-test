import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Each test uses a distinct classId/studentId (and a distinct profile id)
 * so results can't collide via canAccessClass/canMentor's per-request
 * React `cache()` memoization (which keys on argument identity/value).
 */
beforeEach(() => vi.clearAllMocks())
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
vi.mock('@/lib/permission/personas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permission/personas')>()
  const loadActivePersonas = vi.fn()
  // loadPersonaFlags must delegate to the MOCKED loader (the real one closes over
  // the real loadActivePersonas), while reusing the real hasPersona derivation.
  const loadPersonaFlags = vi.fn(async (profileId: string) => {
    const personas = await loadActivePersonas(profileId)
    const has = (name: Parameters<typeof actual.hasPersona>[1]) => actual.hasPersona(personas as never, name)
    return {
      personas,
      isAdmin: has('admin'),
      isSubAdmin: has('sub_admin'),
      isTutor: has('tutor'),
      isManager: has('admin') || has('tutor'),
      isStudent: has('student'),
      isMentor: has('mentor'),
    }
  })
  return {
    ...actual,
    loadActivePersonas,
    loadPersonaFlags,
  }
})

import { createAdminClient } from '@/lib/supabase/admin'
import { loadActivePersonas } from '@/lib/permission/personas'
import { canManageClass, canManageScope, canAccessClass } from '@/lib/permission/class'
import { canMentor } from '@/lib/permission/mentor'

const profile = (overrides: { id: string; role: 'admin' | 'tutor' | 'student' | 'sub_admin' }) =>
  ({ id: overrides.id, email: `${overrides.id}@x.c`, role: overrides.role, status: 'active' }) as any

describe('permission/class', () => {
  it('canManageClass: admin can always manage, without a DB call', async () => {
    const adminPersona = { profile_id: 'admin-cmc-1', persona_name: 'admin', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([adminPersona] as any)
    expect(await canManageClass(profile({ id: 'admin-cmc-1', role: 'admin' }), 'class-cmc-admin')).toBe(true)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('canManageClass: tutor of the class can manage, a tutor not of it cannot', async () => {
    const tutorPersona = { profile_id: 'teach-cmc-1', persona_name: 'tutor', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-1' }) as any)
    expect(await canManageClass(profile({ id: 'teach-cmc-1', role: 'tutor' }), 'class-cmc-yes')).toBe(true)

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning(null) as any)
    expect(await canManageClass(profile({ id: 'teach-cmc-2', role: 'tutor' }), 'class-cmc-no')).toBe(false)
  })

  it('canManageClass: a student never manages a class, without a DB call', async () => {
    const studentPersona = { profile_id: 'stud-cmc-1', persona_name: 'student', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([studentPersona] as any)
    expect(await canManageClass(profile({ id: 'stud-cmc-1', role: 'student' }), 'class-cmc-stud')).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('canManageScope: null classId is admin-only, no DB call for non-admin', async () => {
    const adminPersona = { profile_id: 'admin-cms-1', persona_name: 'admin', status: 'active', scope_type: 'global', scope_id: null }
    const tutorPersona = { profile_id: 'teach-cms-1', persona_name: 'tutor', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([adminPersona] as any)
    expect(await canManageScope(profile({ id: 'admin-cms-1', role: 'admin' }), null)).toBe(true)

    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona] as any)
    expect(await canManageScope(profile({ id: 'teach-cms-1', role: 'tutor' }), null)).toBe(false)
  })

  it('canManageScope: non-null classId delegates to canManageClass', async () => {
    const tutorPersona = { profile_id: 'teach-cms-2', persona_name: 'tutor', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-2' }) as any)
    expect(await canManageScope(profile({ id: 'teach-cms-2', role: 'tutor' }), 'class-cms-yes')).toBe(true)
  })

  it('canAccessClass: admin always, tutor needs class_tutors membership, student needs enrollment', async () => {
    const adminPersona = { profile_id: 'admin-cac-1', persona_name: 'admin', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([adminPersona] as any)
    expect(await canAccessClass(profile({ id: 'admin-cac-1', role: 'admin' }), 'class-cac-admin')).toBe(true)

    const tutorPersona1 = { profile_id: 'teach-cac-1', persona_name: 'tutor', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona1] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'ct-3' }) as any)
    expect(await canAccessClass(profile({ id: 'teach-cac-1', role: 'tutor' }), 'class-cac-teach-yes')).toBe(true)

    const studentPersona1 = { profile_id: 'stud-cac-1', persona_name: 'student', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([studentPersona1] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning({ id: 'en-1' }) as any)
    expect(await canAccessClass(profile({ id: 'stud-cac-1', role: 'student' }), 'class-cac-stud-yes')).toBe(true)

    const studentPersona2 = { profile_id: 'stud-cac-2', persona_name: 'student', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([studentPersona2] as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(adminClientReturning(null) as any)
    expect(await canAccessClass(profile({ id: 'stud-cac-2', role: 'student' }), 'class-cac-stud-no')).toBe(false)
  })
})

describe('permission/mentor', () => {
  it('canMentor: admin persona always allows', async () => {
    const adminPersona = { profile_id: 'admin-cm-1', persona_name: 'admin', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([adminPersona] as any)
    expect(await canMentor(profile({ id: 'admin-cm-1', role: 'admin' }), 'stud-cm-admin')).toBe(true)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('canMentor: student-scoped mentor persona allows without DB lookup', async () => {
    const mentorPersona = { profile_id: 'teach-cm-1', persona_name: 'mentor', status: 'active', scope_type: 'student', scope_id: 'stud-cm-persona' }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([mentorPersona] as any)
    expect(await canMentor(profile({ id: 'teach-cm-1', role: 'tutor' }), 'stud-cm-persona')).toBe(true)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('canMentor: non-admin/mentor users cannot mentor (no personas match)', async () => {
    const tutorPersona = { profile_id: 'teach-cm-2', persona_name: 'tutor', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([tutorPersona] as any)
    expect(await canMentor(profile({ id: 'teach-cm-2', role: 'tutor' }), 'stud-cm-no-mentor-persona')).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('canMentor: student persona never allows', async () => {
    const studentPersona = { profile_id: 'stud-cm-1', persona_name: 'student', status: 'active', scope_type: 'global', scope_id: null }
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([studentPersona] as any)
    expect(await canMentor(profile({ id: 'stud-cm-1', role: 'student' }), 'stud-cm-other')).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
