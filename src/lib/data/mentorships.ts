import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/data/paginate'

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

/** Student ids this profile actively mentors, via the service role - used to
 *  rebuild scoped personas when a revoked mentor is restored. */
export async function selectActiveMenteeIds(mentorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mentorships')
    .select('student_id')
    .eq('mentor_id', mentorId)
    .eq('active', true)
  if (error) throw new Error(`data.mentorships.selectActiveMenteeIds: ${error.message}`)
  return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id)
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
    (from, to) => supabase.from('mentorships').select('*').eq('active', true).range(from, to),
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
    (from, to) => admin.from('mentorships').select('*').eq('active', true).range(from, to),
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

/** Idempotent; reactivates a previously soft-removed link rather than creating
 *  a second row for the same pair. */
export async function upsertMentorship(mentorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('mentorships')
    .upsert({ mentor_id: mentorId, student_id: studentId, active: true }, { onConflict: 'mentor_id,student_id' })
  if (error) throw new Error(`mentorships.assign: ${error.message}`)
}

/** Soft-remove: the row is kept so the history (and a later restore) survives. */
export async function deactivateMentorship(id: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('mentorships').update({ active: false }).eq('id', id)
  if (error) throw new Error(`mentorships.remove: ${error.message}`)
}

/** Compensation path for a failed assignment: fail closed by deactivating the
 *  pastoral link if the scoped mentor persona could not be created. */
export async function deactivateMentorshipByPair(mentorId: string, studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('mentorships')
    .update({ active: false })
    .eq('mentor_id', mentorId)
    .eq('student_id', studentId)
  if (error) throw new Error(`mentorships.removeByPair: ${error.message}`)
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
