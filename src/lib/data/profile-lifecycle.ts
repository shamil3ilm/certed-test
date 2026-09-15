import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Restore and erase, each one Postgres transaction that locks the profile row and re-checks
 * its state before writing (0109). The service decides WHO may act; these make sure the state
 * it acted on is still the state being changed. Revoke is revokeProfileGuarded, in
 * profiles-directory.
 */

export type RestoreOutcome = 'ok' | 'not_found' | 'erased'

/** Status active again, with the role persona, any tutor persona teaching still needs, and the
 *  scoped mentor personas rebuilt from active mentorships - or nothing, for an erased account. */
export async function callRestoreProfile(id: string): Promise<RestoreOutcome> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('restore_profile_guarded', { p_target: id })
  if (error) throw new Error(`data.profiles.restoreGuarded: ${error.message}`)
  return data as RestoreOutcome
}

export type EraseOutcome = 'erased' | 'already_erased' | 'not_disabled' | 'not_found'

/**
 * Delete the notes and guardian details held about a REVOKED account and scrub its PII.
 *
 * `authUserId` is the sign-in still linked to the row, which this does not touch: it lives in
 * the identity provider, outside the transaction. The caller deletes it, then clears the link
 * with clearErasedAuthLink - so a failed delete is finished by erasing again.
 */
export async function callEraseProfile(id: string): Promise<{ outcome: EraseOutcome; authUserId: string | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('erase_profile_guarded', { p_target: id })
  if (error) throw new Error(`data.profiles.eraseGuarded: ${error.message}`)
  const result = data as { outcome: EraseOutcome; auth_user_id: string | null }
  return { outcome: result.outcome, authUserId: result.auth_user_id ?? null }
}

/** Unlink the deleted sign-in from an erased profile. Scoped to the id that was deleted, so it
 *  can never unlink a different login. */
export async function clearErasedAuthLink(id: string, authUserId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ auth_user_id: null })
    .eq('id', id)
    .eq('auth_user_id', authUserId)
  if (error) throw new Error(`data.profiles.clearErasedAuthLink: ${error.message}`)
}
