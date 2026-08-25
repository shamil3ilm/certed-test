import 'server-only'
import { z } from 'zod'
import type { Profile } from '@/lib/auth/profile'
import { canMentor } from '@/lib/permission'
import { PermissionError, ValidationError } from '@/lib/errors'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { insertMenteeNote, selectMenteeNotesByStudent, type MenteeNoteRow } from '@/lib/data/mentee-notes'

/**
 * A mentor's pastoral notes about a mentee. Every read/write is gated on canMentor
 * (the student's mentor, or an admin) - the SAME check the mentee views use - so a
 * tutor or the student themselves can never reach them. Append-only.
 */

const bodySchema = z.string().trim().min(1, 'Write a note.').max(2000)

export async function listMenteeNotes(actor: Profile, studentId: string): Promise<MenteeNoteRow[]> {
  if (!(await canMentor(actor, studentId))) throw new PermissionError('Not allowed to view these notes.')
  return selectMenteeNotesByStudent(studentId)
}

export async function addMenteeNote(actor: Profile, studentId: string, rawBody: unknown): Promise<void> {
  if (!(await canMentor(actor, studentId))) throw new PermissionError('Not allowed to add a note for this student.')
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Write a note.')
  await insertMenteeNote(studentId, actor.id, parsed.data)
  await auditPrivilegedAction(actor, 'mentee.note_add', 'profile', studentId)
}
