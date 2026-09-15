import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'
import { refusalOf } from '@/lib/data/rpc-refusal'

/**
 * Table access for `mentorships` - the pastoral mentor <-> student link, which
 * is independent of who teaches which class.
 *
 * Both clients appear here on purpose, and the choice is never incidental: an
 * RLS read answers "what may THIS caller see" (admin all, mentor own, student
 * own), while a service-role read is for callers the app has already gated in
 * code and that RLS would otherwise over-restrict. Each function says which it
 * is and why.
 */

type MentorshipRef = { student_id: string; mentor_id: string }

export type MentorshipRow = {
  id: string
  mentor_id: string
  student_id: string
  created_at: string
}

/** Active student -> mentor pairs for the given students, for resolving mentor
 *  contacts on a class roster. Several students may share a mentor and a student
 *  may have more than one, so the caller groups the pairs. */
export async function selectActiveMentorshipsForStudents(studentIds: string[]): Promise<MentorshipRef[]> {
  if (studentIds.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mentorships')
    .select('student_id, mentor_id')
    .in('student_id', studentIds)
    .eq('active', true)
  // Fail loud, like selectActiveMentorIdsForStudent below: a transient DB error
  // must not silently become "no mentor" on a class roster, hiding every
  // student's pastoral contact with nothing to indicate a fault.
  if (error) throw new Error(`roster.mentors: ${error.message}`)
  return (data ?? []) as MentorshipRef[]
}

/**
 * RLS-scoped list of active links: an admin sees all, a mentor their own, a student their
 * own.
 *
 * Complete rather than a first page. It resolves WHO is on the mentee roster, and that
 * roster is then paged and counted as if it were whole - so a truncated read here would
 * drop students off /students while the pager still reported a confident total.
 */
export async function selectActiveMentorships(): Promise<MentorshipRow[]> {
  const supabase = await createClient()
  return fetchAllPaged<MentorshipRow>(
    (from, to) =>
      supabase.from('mentorships').select('*').eq('active', true).order('id', { ascending: true }).range(from, to),
    'mentorships.list',
  )
}

/** Every active link, service-role. The Users hub is gated (admin + sub_admin)
 *  in code, and RLS is_active_admin() would otherwise hide every link from a
 *  sub_admin - same reasoning as listProfiles. Only for admin/sub_admin-gated
 *  callers. */
export async function selectAllActiveMentorships(): Promise<MentorshipRow[]> {
  const admin = createAdminClient()
  // Same completeness argument as the RLS read above: the Users hub's mentor/mentee panel
  // presents itself as the full picture of who mentors whom.
  return fetchAllPaged<MentorshipRow>(
    (from, to) =>
      admin.from('mentorships').select('*').eq('active', true).order('id', { ascending: true }).range(from, to),
    'mentorships.listForUsersHub',
  )
}

/** The two parties on a link, for persona cleanup when it is removed. Returns
 *  null for an unknown id (maybeSingle, not single) so removeMentor stays
 *  idempotent for a stale/already-gone link instead of throwing PGRST116. */
export async function selectMentorshipParties(id: string): Promise<MentorshipRef | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('mentorships').select('mentor_id, student_id').eq('id', id).maybeSingle()
  if (error) throw new Error(`mentorships.fetch: ${error.message}`)
  return (data as MentorshipRef) ?? null
}

export type MentorshipRefusal = 'mentor_not_assignable' | 'student_not_active'

/**
 * Link a mentor to a student AND grant the student-scoped mentor persona, in one transaction
 * (0108). The link alone grants nothing and the persona alone shows on no roster, so neither
 * may exist without the other. Idempotent: an inactive link is reactivated, not duplicated.
 * The parties' eligibility is re-checked inside the write, under a lock shared with removal.
 */
export async function callAssignMentorship(
  mentorId: string,
  studentId: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: MentorshipRefusal }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('assign_mentorship', { p_mentor_id: mentorId, p_student_id: studentId })
  const refusal = refusalOf(error, ['mentor_not_assignable', 'student_not_active'] as const)
  if (refusal) return { ok: false, reason: refusal }
  if (error) throw new Error(`mentorships.assign: ${error.message}`)
  return { ok: true, id: data as string }
}

/** End a mentorship: the access-granting persona goes and the link is soft-removed together
 *  (0108). Returns false for an id that names no mentorship; an inactive one is removed again. */
export async function callRemoveMentorship(id: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('remove_mentorship', { p_id: id })
  if (error) throw new Error(`mentorships.remove: ${error.message}`)
  return data === true
}

/**
 * Mentor ids for one student. Service-role.
 *
 * THROWS on error rather than returning an empty list: a silent empty result on
 * a query fault would make a student's dedicated mentor simply vanish from their
 * contacts with nothing to indicate the failure.
 */
export async function selectActiveMentorIdsForStudent(studentId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mentorships')
    .select('mentor_id')
    .eq('student_id', studentId)
    .eq('active', true)
  if (error) throw new Error(`recipient-policy.mentors: ${error.message}`)
  return ((data ?? []) as { mentor_id: string }[]).map((r) => r.mentor_id)
}
