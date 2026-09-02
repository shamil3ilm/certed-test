import { describe, it, expect, vi, beforeEach } from 'vitest'

// Exercises the REAL loadPersonaFlags (not the re-mocked one in permission.test.ts) to
// lock in A-09: isClassAdmin must honour an admin deny override, not the persona baseline.
vi.mock('@/lib/session/actor-context', () => ({ getActorContext: vi.fn() }))
vi.mock('@/lib/data/personas', () => ({ selectActivePersonaAssignments: vi.fn() }))

import { getActorContext } from '@/lib/session/actor-context'
import { selectActivePersonaAssignments } from '@/lib/data/personas'
import { loadPersonaFlags } from '@/lib/permission/personas'

const subAdmin = [
  { profile_id: 'u1', persona_name: 'sub_admin', scope_type: 'global', scope_id: null, status: 'active' },
]

/** An actor context for profile `id` whose RESOLVED allowed capabilities are `allowed`. */
function actorCtx(id: string, allowed: string[]) {
  return {
    userId: 'auth-1',
    profile: { id },
    personas: subAdmin,
    capabilities: { allowed: new Set(allowed), denied: new Set(), sourceByCapability: new Map() },
    accessState: 'active',
  }
}

beforeEach(() => vi.clearAllMocks())

describe('loadPersonaFlags.isClassAdmin (A-09: override-aware)', () => {
  it('is true for a sub_admin whose manageClasses is intact', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actorCtx('u1', ['manageClasses', 'viewClasses']) as never)
    const flags = await loadPersonaFlags('u1')
    expect(flags.isSubAdmin).toBe(true)
    expect(flags.isClassAdmin).toBe(true)
  })

  it('is FALSE when manageClasses is denied by an override, despite the sub_admin baseline', async () => {
    // Resolved capabilities exclude manageClasses - the admin has an active DENY override.
    vi.mocked(getActorContext).mockResolvedValue(actorCtx('u1', ['viewClasses']) as never)
    const flags = await loadPersonaFlags('u1')
    // Baseline still says sub_admin, but the class authority must reflect the deny.
    expect(flags.isSubAdmin).toBe(true)
    expect(flags.isClassAdmin).toBe(false)
  })

  it('falls back to the baseline when computed for a NON-actor profile', async () => {
    // Actor context is a different profile, so the flags load hits the data layer and the
    // resolved-caps shortcut does not apply; the baseline (sub_admin has manageClasses) wins.
    vi.mocked(getActorContext).mockResolvedValue(actorCtx('someone-else', []) as never)
    vi.mocked(selectActivePersonaAssignments).mockResolvedValue(subAdmin as never)
    const flags = await loadPersonaFlags('u1')
    expect(flags.isClassAdmin).toBe(true)
  })
})
