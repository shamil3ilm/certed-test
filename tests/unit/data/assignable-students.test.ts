import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { selectAssignableStudents } from '@/lib/data/profiles-directory'

/**
 * The picker must offer exactly the students the write accepts.
 *
 * `addSubjectToStudent` takes a PENDING student on purpose - "so subjects can be set up at
 * onboarding" - and refuses only a revoked one. The obvious read to reach for,
 * `selectActiveProfilesByRoles`, filters `status = 'active'`, so using it would hide every
 * student who has not signed in yet: precisely the ones an admin is setting up.
 *
 * These assert the PREDICATES rather than a returned row, because the predicates are the whole
 * behaviour - a stubbed client would happily return whatever rows the test handed it no matter
 * which filters were applied.
 */
beforeEach(() => vi.resetAllMocks())

describe('selectAssignableStudents', () => {
  it('excludes only revoked accounts - a pending student is still assignable', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await selectAssignableStudents()

    // The stub hands back one builder per `.from()`, so a key assertion is only trustworthy
    // once we know a single table was queried.
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.neq).toHaveBeenCalledWith('status', 'disabled')
    expect(builder.eq).not.toHaveBeenCalledWith('status', 'active')
  })

  it('asks for students, and no other role', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await selectAssignableStudents()

    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.eq).toHaveBeenCalledWith('role', 'student')
  })

  it('throws on a read error rather than reporting an empty roster', async () => {
    const { client } = makeClientCapturing({ data: null, error: { message: 'boom' } })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    // An empty picker and a failed read look identical on screen, and one of them is a lie.
    await expect(selectAssignableStudents()).rejects.toThrow(/selectAssignableStudents/)
  })
})
