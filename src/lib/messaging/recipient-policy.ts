import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveAdminTierIds, selectActiveIdsAmong, selectActiveProfileIds } from '@/lib/data/profiles'
import {
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForTutor,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorIdsByClassIds,
} from '@/lib/data/class-membership'
import { selectActiveMentorIdsForStudent } from '@/lib/data/mentorships'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'

export type Contact = { id: string; name: string }

/**
 * The set of profile ids `actor` may START a conversation with, by persona.
 * This is the single place messaging eligibility lives, so a NEW persona plugs
 * in by adding a branch here - never a schema change.
 *
 *   admin     -> anyone (any active profile)
 *   sub_admin -> the users they manage (tutors + students)
 *   tutor     -> students in classes they teach + their mentees
 *   mentor    -> their mentees
 *   student   -> the tutors of their classes + their mentors + admins/sub_admins
 *
 * A persona with none of these flags (e.g. a future guardian) reaches nobody
 * until its branch is added.
 */
async function eligibleRecipientIds(actor: Profile): Promise<Set<string>> {
  const flags = await loadPersonaFlags(actor.id)
  const ids = new Set<string>()

  if (flags.isAdmin) {
    for (const id of await selectActiveProfileIds()) ids.add(id)
    ids.delete(actor.id)
    return ids
  }

  if (flags.isSubAdmin) {
    // Sub-admins need the people they manage PLUS an escalation path to admin
    // tier and peer sub-admins inside the in-app messaging system. Use all
    // active profiles rather than a positive role list so future non-admin
    // personas become reachable automatically.
    for (const id of await selectActiveProfileIds()) ids.add(id)
    ids.delete(actor.id)
    return ids
  }

  if (flags.isTutor) {
    const classIds = [...new Set(await selectActiveClassIdsForTutor(actor.id))]
    for (const id of await selectActiveStudentIdsByClassIds(classIds)) ids.add(id)
  }

  // tutor + mentor authority both include the actor's mentees.
  if (flags.isTutor || flags.isMentor) {
    for (const id of await studentIdsOfMentor(actor.id)) ids.add(id)
  }

  if (flags.isStudent) {
    const classIds = [...new Set(await selectActiveClassIdsForStudent(actor.id))]
    for (const id of await selectActiveTutorIdsByClassIds(classIds)) ids.add(id)

    // A mentorship row deliberately SURVIVES the mentor's revocation (so restoring
    // the account rebuilds their scoped personas), so reachability has to check the
    // mentor's account status rather than assume the graph was pruned.
    const mentorIds = await selectActiveMentorIdsForStudent(actor.id)
    for (const id of await selectActiveIdsAmong(mentorIds)) ids.add(id)
  }

  // The academy's active staff (admins + sub-admins) are reachable by every
  // teaching/learning persona, so a tutor or mentor can raise something with an
  // admin - not merely be messaged by one. (admin/sub_admin returned earlier.)
  for (const id of await selectActiveAdminTierIds()) ids.add(id)

  ids.delete(actor.id)
  return ids
}

/** May `actor` open/continue a conversation with `recipientId`? */
export async function canMessage(actor: Profile, recipientId: string): Promise<boolean> {
  if (!recipientId || recipientId === actor.id) return false
  const ids = await eligibleRecipientIds(actor)
  return ids.has(recipientId)
}

/** The allowed recipient list for `actor`'s composer, name-resolved and sorted. */
export async function listMessageableContacts(actor: Profile): Promise<Contact[]> {
  const ids = [...(await eligibleRecipientIds(actor))]
  if (ids.length === 0) return []
  const names = await getProfileNamesByIds(ids)
  return ids.map((id) => ({ id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name))
}
