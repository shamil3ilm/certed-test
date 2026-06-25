import { createClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'teacher' | 'student'
  status: 'active' | 'pending' | 'disabled'
  class_level: string | null
}

/** Loads the signed-in user's allowlist profile, or null if not signed in / not allowlisted. */
export async function getProfile(): Promise<Profile | null> {
  // Portal is dormant until Supabase is configured — degrade gracefully
  // instead of throwing (mirrors the middleware env-guard).
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return (data as Profile) ?? null
}
