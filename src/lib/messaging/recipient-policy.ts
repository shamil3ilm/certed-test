import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { ValidationError } from '@/lib/errors'
import { listResolvedContacts, resolveEligibleRecipients } from './recipient-policy-resolver'
import { relationKeys, type Contact } from './recipient-policy-shared'

export type { Contact, ContactPersona } from './recipient-policy-shared'

export async function canMessage(actor: Profile, recipientId: string): Promise<boolean> {
  if (!recipientId || recipientId === actor.id) return false
  const { recipients } = await resolveEligibleRecipients(actor)
  return recipients.has(recipientId)
}

export async function unmessageableRecipients(actor: Profile, recipientIds: string[]): Promise<string[]> {
  if (recipientIds.length === 0) return []
  const { recipients } = await resolveEligibleRecipients(actor)
  return recipientIds.filter((id) => !id || id === actor.id || !recipients.has(id))
}

export async function assertGroupRecipientsRelated(actor: Profile, recipientIds: string[]): Promise<void> {
  if (recipientIds.length <= 1) return
  const { recipients } = await resolveEligibleRecipients(actor)
  const selected = recipientIds.map((id) => recipients.get(id))
  if (selected.some((info) => !info?.viaDirect)) {
    throw new ValidationError('Only directly related contacts can be added to a group chat.')
  }

  let shared = relationKeys(selected[0]!)
  for (const info of selected.slice(1)) {
    const keys = relationKeys(info!)
    shared = new Set([...shared].filter((key) => keys.has(key)))
  }
  if (shared.size === 0) {
    throw new ValidationError('Group chats may only include contacts connected through the same student or class.')
  }
}

export async function listMessageableContacts(actor: Profile): Promise<Contact[]> {
  return listResolvedContacts(actor)
}
