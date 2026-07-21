import { cache } from 'react'
import { getActorContext } from '@/lib/session/actor-context'

export type Profile = {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'sub_admin' | 'tutor' | 'mentor' | 'student'
  status: 'active' | 'pending' | 'disabled'
  class_level: string | null
}

/**
 * Backwards-compatible profile helper. Existing callers can keep using
 * `getProfile()` while auth resolution is consolidated under `getActorContext()`.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  return (await getActorContext()).profile
})
