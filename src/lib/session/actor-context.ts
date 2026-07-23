import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { selectOwnProfileByAuthUserId } from '@/lib/data/profiles'
import { selectOwnActivePersonas } from '@/lib/data/personas'
import { selectOwnActiveGlobalOverrides } from '@/lib/data/capability-overrides'
import {
  type Capability,
  type CapabilityOverride,
  type ResolvedCapabilitySet,
  isCapability,
  resolveCapabilities,
} from '@/lib/capabilities'

export type AccessState = 'unauthenticated' | 'pending' | 'disabled' | 'active'

export type PersonaAssignment = {
  id: string
  profile_id: string
  persona_name: string
  scope_type: string
  scope_id: string | null
  status: string
  assigned_at: string
}

export type ActorContext = {
  userId: string | null
  profile: Profile | null
  personas: PersonaAssignment[]
  /** Effective capabilities: persona baseline resolved with admin overrides. */
  capabilities: ResolvedCapabilitySet
  accessState: AccessState
}

const NO_CAPABILITIES: ResolvedCapabilitySet = {
  allowed: new Set<Capability>(),
  denied: new Set<Capability>(),
  sourceByCapability: new Map(),
}

function resolveAccessState(profile: Profile | null): AccessState {
  if (!profile) return 'pending'
  if (profile.status === 'disabled') return 'disabled'
  return profile.status === 'active' ? 'active' : 'pending'
}

/**
 * Shared request-scoped auth/profile loader. This is the canonical source for
 * actor state so pages, layouts, and route handlers do not each re-run their
 * own auth + profile lookup sequence.
 *
 * Personas are loaded by profile.id (the FK in persona_assignments), not by
 * auth.uid() - auth.uid() is the authentication identity, profile.id the domain one.
 */
export const getActorContext = cache(async (): Promise<ActorContext> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return { userId: null, profile: null, personas: [], capabilities: NO_CAPABILITIES, accessState: 'unauthenticated' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { userId: null, profile: null, personas: [], capabilities: NO_CAPABILITIES, accessState: 'unauthenticated' }
  }

  const profile = await selectOwnProfileByAuthUserId(user.id)

  // Personas are keyed by profile.id (persona_assignments.profile_id), not auth.uid().
  let personas: PersonaAssignment[] = []
  let overrides: CapabilityOverride[] = []
  if (profile) {
    // Both reads go through the RLS client's self-read policy - the same trust
    // boundary - and both THROW rather than yielding []. See the note on each.
    const [personaRows, overrideRows] = await Promise.all([
      selectOwnActivePersonas(profile.id),
      selectOwnActiveGlobalOverrides(profile.id),
    ])
    // Both reads fail CLOSED and LOUD rather than yielding []. Coercing a failed
    // read to [] is a double hazard: it strips EVERY capability (blank nav +
    // dashboard for a healthy user - the 0022 recursion outage), and it drops any
    // admin-issued DENY override, granting back a capability an admin explicitly
    // revoked. Throwing surfaces via the page error boundary / API authFail
    // instead, so no access is derived from a read we could not trust.
    personas = personaRows as unknown as PersonaAssignment[]
    overrides = overrideRows
      .filter((o) => isCapability(o.capability))
      .map((o) => ({ capability: o.capability as Capability, effect: o.effect as 'allow' | 'deny' }))
  }

  return {
    userId: user.id,
    profile,
    personas,
    capabilities: resolveCapabilities({ personas, overrides }),
    accessState: resolveAccessState(profile),
  }
})
