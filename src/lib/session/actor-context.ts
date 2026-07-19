import { cache } from 'react'
import type { Profile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

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
  accessState: AccessState
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
 * auth.uid() — auth.uid() is the authentication identity, profile.id the domain one.
 */
export const getActorContext = cache(async (): Promise<ActorContext> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return { userId: null, profile: null, personas: [], accessState: 'unauthenticated' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, profile: null, personas: [], accessState: 'unauthenticated' }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const profile = (profileData as Profile) ?? null

  // Personas are keyed by profile.id (persona_assignments.profile_id), not auth.uid().
  let personas: PersonaAssignment[] = []
  if (profile) {
    const { data: personasData } = await supabase
      .from('persona_assignments')
      .select('*')
      .eq('profile_id', profile.id)
      .eq('status', 'active')

    personas = (personasData as PersonaAssignment[]) ?? []
  }

  return {
    userId: user.id,
    profile,
    personas,
    accessState: resolveAccessState(profile),
  }
})
