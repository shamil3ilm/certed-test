import 'server-only'
import { assertFilterSafeId, isFilterSafeInstant } from '@/lib/text/filter-values'
import type { Page } from '@/lib/pagination'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Table access for `mentee_notes` (migration 0078) - a mentor's pastoral notes about a
 * student. Writes are service-role (the domain gates on canMentor); reads are service-
 * role too, gated by the caller. The RLS read policy (admin OR mentors_student) is the
 * DB backstop against direct PostgREST access.
 */

export type MenteeNoteRow = {
  id: string
  student_id: string
  author_id: string | null
  body: string
  created_at: string
}

const COLUMNS = 'id, student_id, author_id, body, created_at'

export async function insertMenteeNote(studentId: string, authorId: string, body: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('mentee_notes').insert({ student_id: studentId, author_id: authorId, body })
  if (error) throw new Error(`menteeNotes.insert: ${error.message}`)
}

/** Hard-delete every pastoral note ABOUT a student - used by the erasure right, which
 *  removes personal data held about the erased person. Notes they AUTHORED about OTHERS stay
 *  (author_id is ON DELETE SET NULL at the row level), so other students' records are intact. */
export async function deleteMenteeNotesForStudent(studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('mentee_notes').delete().eq('student_id', studentId)
  if (error) throw new Error(`menteeNotes.deleteForStudent: ${error.message}`)
}

/**
 * ONE page of a student's pastoral notes, newest first, with the exact total.
 *
 * Previously a flat newest-200 with no pager: a mentor writing weekly reaches that in four
 * years, and this is the record you would least want quietly shortened - the older notes
 * simply stopped existing as far as the page was concerned.
 */
export async function selectMenteeNotePage(
  studentId: string,
  range: { from: number; to: number },
  /** A non-admin mentor sees only notes they authored, plus anything written since their
   *  own mentorship began. Applied in SQL rather than to the fetched rows: filtering after
   *  the read would make the COUNT describe a different set from the one on screen, so the
   *  pager would promise pages of another mentor's private observations. */
  visibility?: { authorId: string; since: string | null },
): Promise<Page<MenteeNoteRow>> {
  const admin = createAdminClient()
  let query = admin
    .from('mentee_notes')
    .select(COLUMNS, { count: 'exact' })
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    // Two notes saved in the same second would otherwise order arbitrarily between pages.
    .order('id', { ascending: true })
  if (visibility) {
    // `.or()` takes a STRING whose grammar is commas and parentheses, which is why
    // escapeOrIlike exists for free text. These are structured values, so they are
    // VALIDATED rather than escaped - a uuid and an ISO instant cannot contain the grammar,
    // and anything that does is a bug upstream worth failing on rather than sanitising into
    // a filter that quietly means something else. Fail closed: on a bad tenure value, fall
    // back to the mentor's own notes rather than widening the read.
    const since = isFilterSafeInstant(visibility.since) ? visibility.since : null
    assertFilterSafeId(visibility.authorId, 'menteeNotes.visibility.authorId')
    query = since
      ? query.or(`author_id.eq.${visibility.authorId},created_at.gte.${since}`)
      : query.eq('author_id', visibility.authorId)
  }
  const { data, error, count } = await query.range(range.from, range.to)
  if (error) throw new Error(`menteeNotes.list: ${error.message}`)
  return { items: (data ?? []) as MenteeNoteRow[], total: count ?? 0 }
}
