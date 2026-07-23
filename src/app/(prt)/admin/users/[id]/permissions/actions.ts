'use server'
import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth/require-role'
import { actionDone, toActionError, type ActionStatusResult } from '@/lib/api/action-error'
import { setCapabilityOverride } from '@/lib/services/capability-overrides'

/**
 * Set one capability's override for a user (admin-tier only). effect 'default'
 * reverts to the persona baseline; 'allow'/'deny' create the override. Sensitive
 * capabilities require a reason (enforced in the service).
 */
export async function setUserCapabilityAction(input: {
  profileId: string
  capability: string
  effect: 'allow' | 'deny' | 'default'
  reason?: string | null
}): Promise<ActionStatusResult> {
  // manageAdminTier is the structural admin marker (a hard rule, never override-
  // granted), so only a genuine admin can edit another user's permissions.
  const me = await requireCapability('manageAdminTier')
  try {
    await setCapabilityOverride(me, input)
    revalidatePath(`/admin/users/${input.profileId}/permissions`)
    return actionDone()
  } catch (error) {
    return toActionError(error)
  }
}
