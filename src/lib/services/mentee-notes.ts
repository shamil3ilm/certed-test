import 'server-only'
import { z } from 'zod'
import type { Profile } from '@/lib/auth/profile'
import { canMentor } from '@/lib/permission'
import { selectMentorAssignedAt } from '@/lib/data/personas'
import { PermissionError, ValidationError } from '@/lib/errors'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { insertMenteeNote, selectMenteeNotesByStudent, type MenteeNoteRow } from '@/lib/data/mentee-notes'
import { loadPersonaFlags } from '@/lib/permission/personas'

/**
 * A mentor's pastoral notes about a mentee. Every read/write is gated on canMentor
 * (the student's mentor, or an admin) - the SAME check the mentee views use - so a
 * tutor or the student themselves can never reach them. Append-only.
 */

const bodySchema = z.string().trim().min(1, 'Write a note.').max(2000)

export async function listMenteeNotes(actor: Profile, studentId: string): Promise<MenteeNoteRow[]> {
  if (!(await canMentor(actor, studentId))) throw new PermissionError('Not allowed to view these notes.')
  const notes = await selectMenteeNotesByStudent(studentId)

  // Data minimisation: a mentor sees pastoral notes only from THEIR OWN mentorship
  // onward, plus any they authored - not a previous mentor's private observations. An ADMIN
  // sees the full history. Enforced here because the read is service-role gated by this
  // service, so this IS the operative boundary. Fail-closed: a non-admin with no resolved
  // mentorship start sees only their own notes.
  //
  // DELIBERATELY `isAdmin`, and NOT the shared mentoring-oversight predicate that
  // /students and the session-times list use. Those surfaces read class-scoped data, which
  // 0092 widened to sub_admin in RLS (teaches_class); this one reads mentee_notes, whose
  // policy gates on is_active_admin() - which 0092 deliberately did NOT widen. Using the
  // oversight predicate here would make this service-role read disclose rows the database
  // itself would refuse, i.e. the app LOOSER than RLS - the inversion persona-model.md
  // warns about. A sub_admin therefore sees an empty panel by design; widening that is a
  // DPDP decision about a minor's pastoral history and needs a migration to
  // mentee_notes_read, not a service-layer predicate swap.
  const { isAdmin } = await loadPersonaFlags(actor.id)
  let visible = notes
  if (!isAdmin) {
    const since = await selectMentorAssignedAt(actor.id, studentId)
    visible = notes.filter((n) => n.author_id === actor.id || (since != null && n.created_at >= since))
  }

  // Audit the READ, not only the write. Pastoral notes are sensitive personal
  // data about a (often minor) student, so who VIEWED them is as much an access event
  // as who wrote them. Only log an actual disclosure (notes returned), to avoid a row
  // for every empty panel load.
  if (visible.length) await auditPrivilegedAction(actor, 'mentee.note_view', 'profile', studentId)
  return visible
}

export async function addMenteeNote(actor: Profile, studentId: string, rawBody: unknown): Promise<void> {
  if (!(await canMentor(actor, studentId))) {
    // Audit a DENIED write so probing which students a mentor may write to leaves
    // a trace, instead of being indistinguishable from a validation failure.
    await auditPrivilegedAction(actor, 'mentee.note_add_denied', 'profile', studentId)
    throw new PermissionError('Not allowed to add a note for this student.')
  }
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Write a note.')
  await insertMenteeNote(studentId, actor.id, parsed.data)
  await auditPrivilegedAction(actor, 'mentee.note_add', 'profile', studentId)
}

export type { MenteeNoteRow } from '@/lib/data/mentee-notes'
