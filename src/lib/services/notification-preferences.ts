import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { isMutableNotificationKey, type MutableNotificationKey } from '@/lib/notifications/keys'
import { replaceMyMutes, selectMyMutedKeys } from '@/lib/data/notification-mutes'
import { ValidationError } from '@/lib/errors'

/** The kinds of notice the signed-in person has muted. */
export async function getMyMutedKeys(): Promise<MutableNotificationKey[]> {
  return (await selectMyMutedKeys()).filter(isMutableNotificationKey)
}

/**
 * Set which kinds of notice the person does not want. Their own row set, replaced whole, and only
 * ever kinds that can be muted: a forged key for an account, security or money notice is refused
 * rather than stored, so no request can switch those off.
 */
export async function setMyMutedKeys(actor: Profile, keys: readonly string[]): Promise<void> {
  const unique = [...new Set(keys)]
  const rejected = unique.filter((key) => !isMutableNotificationKey(key))
  if (rejected.length > 0) throw new ValidationError('That kind of notification cannot be turned off.')
  await replaceMyMutes(actor.id, unique)
}
