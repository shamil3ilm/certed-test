import 'server-only'
import { selectActiveMentorships, selectAllActiveMentorships, type MentorshipRow } from '@/lib/data/mentorships'
import { selectScopedMenteeIds } from '@/lib/data/personas'

/** Reading mentorship links. Table access is in src/lib/data/mentorships. */

export type Mentorship = MentorshipRow

/** RLS-scoped list of active links (admin: all, mentor: own, student: own). */
export async function listMentorships(): Promise<Mentorship[]> {
  return selectActiveMentorships()
}

/** Every active link, for the Users hub. That page is gated (admin + sub_admin)
 *  in code, and RLS would otherwise hide every link from a sub_admin - so this
 *  reads service-role and must only be called from those gated pages. */
export async function listMentorshipsForUsersHub(): Promise<Mentorship[]> {
  return selectAllActiveMentorships()
}

/** Active student ids a mentor supervises. Derived from the mentor's active
 *  student-scoped `mentor` personas - the SAME source canMentor authorizes
 *  against - so the mentee list, dashboard "Your mentees", and messaging
 *  recipients can never disagree with per-student access (which they could when
 *  this read the mentorships table while access read personas). */
export async function studentIdsOfMentor(mentorId: string): Promise<string[]> {
  return selectScopedMenteeIds(mentorId)
}
