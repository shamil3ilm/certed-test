import 'server-only'
import { selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { documentCategoryLabel } from '@/lib/documents/categories'
import { logError } from '@/lib/observability/log'
import { getClassMembers } from '@/lib/services/classes'
import { notifyBestEffort } from '@/lib/services/notifications'
import type { Document } from './queries'

/**
 * Tell everyone who can read a document that it was posted or updated: the class's students (a
 * class-visible document only - a staff-only one must not surface to them, even as a
 * notification), the class's tutors, and the mentors of its students. Whoever made the change is
 * left out; they were there.
 *
 * Admins are not told: they read every class, and a notification per upload for each of them is
 * noise - the Documents page is where they look. Best-effort (the write is already committed).
 */
export async function notifyClassOfDocument(
  doc: Document,
  action: 'New document' | 'Updated document' | 'Document removed' | 'Document restored',
  actorId?: string | null,
): Promise<void> {
  try {
    const members = await getClassMembers(doc.class_id)
    const studentIds = members.students.map((s) => s.id)
    const mentorships = await selectActiveMentorshipsForStudents(studentIds)
    const staffIds = [...members.tutors.map((t) => t.id), ...mentorships.map((m) => m.mentor_id)]

    const isClassVisible = doc.visibility === 'class'
    const label = doc.subject ?? documentCategoryLabel(doc.category)
    const base = {
      kind: 'resource' as const,
      title: `${action}: ${doc.title}`,
      link: `/classroom/${doc.class_id}/classwork#materials`,
    }
    await Promise.all([
      isClassVisible
        ? notifyBestEffort(
            studentIds.filter((id) => id !== actorId),
            { ...base, body: label },
          )
        : undefined,
      notifyBestEffort(
        // A student of this class never reads the staff copy: they hear it as a student, or not at all.
        staffIds.filter((id) => id !== actorId && !studentIds.includes(id)),
        { ...base, body: isClassVisible ? label : `Staff only - ${label}` },
      ),
    ])
  } catch (error) {
    logError('notifyClassOfDocument', error, { classId: doc.class_id, action }, { toSentry: false })
  }
}
