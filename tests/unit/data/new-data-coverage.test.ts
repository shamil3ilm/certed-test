import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { selectActiveClassIds, selectActiveClassIdsAmong } from '@/lib/data/classes'
import { selectTutorOverlappingSessions, updateSessionActualTimesAsService } from '@/lib/data/class-sessions'
import { selectSessionsForClassesInRange } from '@/lib/data/analytics'
import { selectLatestConsent } from '@/lib/data/consents'
import { deleteMenteeNotesForStudent } from '@/lib/data/mentee-notes'
import { selectMentorAssignedAt } from '@/lib/data/personas'
import { selectProfileErasedAt, anonymizeProfileForErasure, claimAllowlistRowOnOAuth } from '@/lib/data/profiles-auth'
import { signOutOwnOtherSessions } from '@/lib/data/auth-accounts'

beforeEach(() => vi.resetAllMocks())

describe('new data-layer functions', () => {
  it('selectActiveClassIds / selectActiveClassIdsAmong', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: [{ id: 'c1' }], error: null }) as never)
    expect(await selectActiveClassIds()).toEqual(['c1'])
    expect(await selectActiveClassIdsAmong([])).toEqual([])
    expect(await selectActiveClassIdsAmong(['c1'])).toEqual(['c1'])
  })

  it('selectTutorOverlappingSessions returns the (class, date) keys', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({ data: [{ class_id: 'c1', session_date: '2026-08-05' }], error: null }) as never,
    )
    expect(await selectTutorOverlappingSessions('t1', 'a', 'b')).toEqual([
      { class_id: 'c1', session_date: '2026-08-05' },
    ])
  })

  it('updateSessionActualTimesAsService returns whether a row matched', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: { id: 's1' }, error: null }) as never)
    expect(await updateSessionActualTimesAsService('c1', 'd', 's', 'e', 'v1')).toBe(true)
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as never)
    expect(await updateSessionActualTimesAsService('c1', 'd', 's', 'e')).toBe(false)
  })

  it('selectSessionsForClassesInRange short-circuits on empty class ids', async () => {
    expect(await selectSessionsForClassesInRange([], 'a', 'b')).toEqual([])
  })

  it('selectLatestConsent reads the newest consent via the RLS client', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient({ data: { terms_version: 'v1' }, error: null }) as never)
    expect((await selectLatestConsent('u1'))?.terms_version).toBe('v1')
  })

  it('deleteMenteeNotesForStudent issues the delete', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as never)
    await expect(deleteMenteeNotesForStudent('s1')).resolves.toBeUndefined()
  })

  it('selectMentorAssignedAt returns the assigned_at', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({ data: { assigned_at: '2026-06-01' }, error: null }) as never,
    )
    expect(await selectMentorAssignedAt('m1', 's1')).toBe('2026-06-01')
  })

  it('profiles-auth: erased marker, anonymise, OAuth claim, and sign-out-others', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: { erased_at: null }, error: null }) as never)
    expect(await selectProfileErasedAt('u1')).toBeNull()

    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as never)
    await expect(anonymizeProfileForErasure('u1')).resolves.toBeUndefined()

    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: { id: 'u1' }, error: null }) as never)
    expect(await claimAllowlistRowOnOAuth('u1', 'auth-1')).toBe('u1')

    const signOut = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never)
    await expect(signOutOwnOtherSessions()).resolves.toBeUndefined()
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
})
