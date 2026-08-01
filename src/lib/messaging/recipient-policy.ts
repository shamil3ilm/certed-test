import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { selectActiveIdsAmong } from '@/lib/data/profiles'
import {
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForStudents,
  selectActiveClassIdsForTutor,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorIdsByClassIds,
} from '@/lib/data/class-membership'
import { selectActiveProfileIdsByPersona } from '@/lib/data/personas'
import { selectActiveMentorIdsForStudent, selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { MESSAGING_PERSONAS, matrixAllows, parseMessagingMatrix, personasFromFlags } from '@/lib/messaging/matrix'

export type Contact = { id: string; name: string }

/**
 * The set of profile ids `actor` may START a conversation with. This is the
 * single place messaging eligibility lives.
 *
 * DEFAULT POLICY - DIRECT CONTACTS ONLY. Messaging is an UNDIRECTED relationship
 * graph: a 1:1 thread re-checks eligibility on every send (see
 * assertStillMessageable), so both ends must be able to reach each other or a
 * reply would be blocked. The edges are therefore symmetric by construction:
 *
 *   student <-> tutor   student enrolled in a class the tutor teaches
 *   student <-> mentor  a mentorship link
 *   mentor  <-> tutor   the tutor teaches a class one of the mentor's mentees is in
 *
 * Admins and sub-admins are intentionally OUT of scope for now - no admin DMs by
 * default, in or out. (Admin-configurable widening of this graph is layered on
 * top separately.) A persona with none of these relationships reaches nobody.
 */
async function eligibleRecipientIds(actor: Profile): Promise<Set<string>> {
  const flags = await loadPersonaFlags(actor.id)
  const ids = new Set<string>()

  if (flags.isStudent) {
    // student <-> tutor: the tutors of the classes this student is enrolled in.
    const classIds = [...new Set(await selectActiveClassIdsForStudent(actor.id))]
    if (classIds.length) for (const id of await selectActiveTutorIdsByClassIds(classIds)) ids.add(id)

    // student <-> mentor: a mentorship row deliberately SURVIVES the mentor's
    // revocation (restoring the account rebuilds their scoped personas), so filter
    // to mentors whose account is still active rather than assume the graph pruned.
    const mentorIds = await selectActiveMentorIdsForStudent(actor.id)
    if (mentorIds.length) for (const id of await selectActiveIdsAmong(mentorIds)) ids.add(id)
  }

  if (flags.isTutor) {
    // tutor <-> student: students in the classes this tutor teaches.
    const classIds = [...new Set(await selectActiveClassIdsForTutor(actor.id))]
    const studentIds = classIds.length ? await selectActiveStudentIdsByClassIds(classIds) : []
    for (const id of studentIds) ids.add(id)

    // tutor <-> mentor: the (still-active) mentors of those students - the reverse
    // of the mentor<->tutor edge, so a mentor and the mentee's tutor can converse.
    if (studentIds.length) {
      const mentorIds = (await selectActiveMentorshipsForStudents(studentIds)).map((r) => r.mentor_id)
      if (mentorIds.length) for (const id of await selectActiveIdsAmong(mentorIds)) ids.add(id)
    }
  }

  if (flags.hasMentorAuthority) {
    // mentor <-> student: this mentor's active mentees.
    const menteeIds = await studentIdsOfMentor(actor.id)
    for (const id of menteeIds) ids.add(id)

    // mentor <-> tutor: the tutors of the classes those mentees are enrolled in.
    if (menteeIds.length) {
      const classIds = [...new Set(await selectActiveClassIdsForStudents(menteeIds))]
      if (classIds.length) for (const id of await selectActiveTutorIdsByClassIds(classIds)) ids.add(id)
    }
  }

  // Admin-configured widening, ADDITIVE on top of the direct-contact edges above:
  // for every enabled persona pair the actor may also message everyone holding the
  // paired persona at any active scope, but only while the target profile itself
  // is still active. The empty matrix - the default - adds nothing, so scope
  // stays "direct contacts only" until an admin opts in.
  const matrix = parseMessagingMatrix((await getOrgSettings()).messaging_matrix)
  if (matrix.size) {
    const targets = new Set<string>()
    for (const a of personasFromFlags(flags)) {
      for (const b of MESSAGING_PERSONAS) if (matrixAllows(matrix, a, b)) targets.add(b)
    }
    for (const persona of targets) for (const id of await selectActiveProfileIdsByPersona(persona)) ids.add(id)
  }

  ids.delete(actor.id)
  return ids
}

/** May `actor` open/continue a conversation with `recipientId`? */
export async function canMessage(actor: Profile, recipientId: string): Promise<boolean> {
  if (!recipientId || recipientId === actor.id) return false
  const ids = await eligibleRecipientIds(actor)
  return ids.has(recipientId)
}

/** Which of `recipientIds` the actor may NOT message. Resolves the eligible set
 *  ONCE (canMessage recomputes it every call, so checking a whole recipient list
 *  with it is an N+1 over the 5-9 queries the resolution costs). */
export async function unmessageableRecipients(actor: Profile, recipientIds: string[]): Promise<string[]> {
  if (recipientIds.length === 0) return []
  const ids = await eligibleRecipientIds(actor)
  return recipientIds.filter((id) => !id || id === actor.id || !ids.has(id))
}

/** The allowed recipient list for `actor`'s composer, name-resolved and sorted. */
export async function listMessageableContacts(actor: Profile): Promise<Contact[]> {
  const ids = [...(await eligibleRecipientIds(actor))]
  if (ids.length === 0) return []
  const names = await getProfileNamesByIds(ids)
  return ids.map((id) => ({ id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name))
}
