import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
// Default: no signed-in actor, so loadActivePersonas falls back to the admin query.
vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({ userId: null, profile: null, personas: [], accessState: 'unauthenticated' })),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getActorContext } from '@/lib/session/actor-context'
import { loadActivePersonas, hasPersona, hasScopedPersona } from '@/lib/permission/personas'

const adminPersona = {
  profile_id: 'profile-1',
  persona_name: 'admin',
  status: 'active',
  scope_type: 'global',
  scope_id: null,
} as any
const tutorPersona = {
  profile_id: 'profile-1',
  persona_name: 'tutor',
  status: 'active',
  scope_type: 'global',
  scope_id: null,
} as any
const mentorPersona = {
  profile_id: 'profile-1',
  persona_name: 'mentor',
  status: 'active',
  scope_type: 'student',
  scope_id: 'student-1',
} as any
const _inactiveAdminPersona = {
  profile_id: 'profile-1',
  persona_name: 'admin',
  status: 'inactive',
  scope_type: 'global',
  scope_id: null,
} as any

beforeEach(() => vi.resetAllMocks())

describe('loadActivePersonas', () => {
  it('returns active personas for a profile', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [adminPersona, tutorPersona], error: null }) as any,
    )
    const personas = await loadActivePersonas('profile-1')
    expect(personas).toEqual([adminPersona, tutorPersona])
  })

  it('only queries active personas (database filters)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [adminPersona], error: null }) as any, // mock returns already-filtered active only
    )
    const personas = await loadActivePersonas('profile-1')
    expect(personas).toEqual([adminPersona])
  })

  it('returns empty array when profile has no active personas', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as any)
    const personas = await loadActivePersonas('profile-1')
    expect(personas).toEqual([])
  })

  it('throws when database query fails', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'DB error' } }) as any)
    await expect(loadActivePersonas('profile-1')).rejects.toThrow()
  })

  it('reuses the actor context for the current user without a second query', async () => {
    vi.mocked(getActorContext).mockResolvedValueOnce({
      userId: 'auth-1',
      profile: { id: 'profile-1' } as any,
      personas: [adminPersona, tutorPersona],
      accessState: 'active',
    } as any)
    const personas = await loadActivePersonas('profile-1')
    expect(personas).toEqual([adminPersona, tutorPersona])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('still loads via admin client for a different profile than the actor', async () => {
    vi.mocked(getActorContext).mockResolvedValueOnce({
      userId: 'auth-1',
      profile: { id: 'profile-1' } as any,
      personas: [adminPersona],
      accessState: 'active',
    } as any)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [tutorPersona], error: null }) as any)
    const personas = await loadActivePersonas('profile-2')
    expect(personas).toEqual([tutorPersona])
    expect(createAdminClient).toHaveBeenCalled()
  })
})

describe('hasPersona', () => {
  it('returns true when persona exists and is active', () => {
    const personas = [adminPersona, tutorPersona]
    expect(hasPersona(personas, 'admin')).toBe(true)
    expect(hasPersona(personas, 'tutor')).toBe(true)
  })

  it('returns false when persona does not exist', () => {
    const personas = [adminPersona]
    expect(hasPersona(personas, 'tutor')).toBe(false)
  })

  it('returns false when personas array is empty', () => {
    expect(hasPersona([], 'admin')).toBe(false)
  })

  it('ignores scope for global personas', () => {
    const personas = [adminPersona] // global, scope_id=null
    expect(hasPersona(personas, 'admin')).toBe(true)
  })

  it('does not match scoped personas by name alone', () => {
    const personas = [mentorPersona]
    // hasScopedPersona should be used for scoped checks
    expect(hasPersona(personas, 'mentor')).toBe(false)
  })
})

describe('hasScopedPersona', () => {
  it('returns true when scoped persona exists with matching scope_id', () => {
    const personas = [mentorPersona]
    expect(hasScopedPersona(personas, 'mentor', 'student-1')).toBe(true)
  })

  it('returns false when scoped persona exists but scope_id does not match', () => {
    const personas = [mentorPersona]
    expect(hasScopedPersona(personas, 'mentor', 'student-2')).toBe(false)
  })

  it('returns false when scoped persona does not exist', () => {
    const personas = [adminPersona]
    expect(hasScopedPersona(personas, 'mentor', 'student-1')).toBe(false)
  })

  it('returns false when personas array is empty', () => {
    expect(hasScopedPersona([], 'mentor', 'student-1')).toBe(false)
  })

  it('does not match global personas', () => {
    const personas = [adminPersona] // scope_id=null
    expect(hasScopedPersona(personas, 'admin', 'any-id')).toBe(false)
  })
})
