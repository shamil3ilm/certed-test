import 'server-only'
import {
  selectActiveMentorships,
  selectAllActiveMentorships,
  selectMenteeIdsVisibleTo,
  type MentorshipRow,
} from '@/lib/data/mentorships'

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

/** Active student ids a mentor supervises. */
export async function studentIdsOfMentor(mentorId: string): Promise<string[]> {
  return selectMenteeIdsVisibleTo(mentorId)
}
