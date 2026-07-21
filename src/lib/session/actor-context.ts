import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
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
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return { userId: null, profile: null, personas: [], capabilities: NO_CAPABILITIES, accessState: 'unauthenticated' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { userId: null, profile: null, personas: [], capabilities: NO_CAPABILITIES, accessState: 'unauthenticated' }
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const profile = (profileData as Profile) ?? null

  // Personas are keyed by profile.id (persona_assignments.profile_id), not auth.uid().
  let personas: PersonaAssignment[] = []
  let overrides: CapabilityOverride[] = []
  if (profile) {
    const [personaRes, overrideRes] = await Promise.all([
      supabase.from('persona_assignments').select('*').eq('profile_id', profile.id).eq('status', 'active'),
      // The actor's own ACTIVE GLOBAL overrides, read through the RLS client via
      // the self-read policy - the same trust boundary as persona_assignments.
      supabase
        .from('capability_overrides')
        .select('capability, effect')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .eq('scope_type', 'global'),
    ])
    personas = (personaRes.data as PersonaAssignment[]) ?? []
    overrides = ((overrideRes.data as { capability: string; effect: 'allow' | 'deny' }[]) ?? [])
      .filter((o) => isCapability(o.capability))
      .map((o) => ({ capability: o.capability as Capability, effect: o.effect }))
  }

  return {
    userId: user.id,
    profile,
    personas,
    capabilities: resolveCapabilities({ personas, overrides }),
    accessState: resolveAccessState(profile),
  }
})
