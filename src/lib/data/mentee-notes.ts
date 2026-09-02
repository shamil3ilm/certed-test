import 'server-only'
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

/** Hard-delete every pastoral note ABOUT a student - used by the erasure right (N-04), which
 *  removes personal data held about the erased person. Notes they AUTHORED about OTHERS stay
 *  (author_id is ON DELETE SET NULL at the row level), so other students' records are intact. */
export async function deleteMenteeNotesForStudent(studentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('mentee_notes').delete().eq('student_id', studentId)
  if (error) throw new Error(`menteeNotes.deleteForStudent: ${error.message}`)
}

export async function selectMenteeNotesByStudent(studentId: string, limit = 200): Promise<MenteeNoteRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mentee_notes')
    .select(COLUMNS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`menteeNotes.list: ${error.message}`)
  return (data ?? []) as MenteeNoteRow[]
}
