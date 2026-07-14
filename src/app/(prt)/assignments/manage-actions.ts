'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment, setAssignmentStatus, updateAssignment } from '@/lib/repos/assignments'
import { getSubmission, gradeSubmission } from '@/lib/repos/submissions'
import { deleteResource, getResource } from '@/lib/repos/resources'
import { canManageClass } from '@/lib/repos/classes'
import { writeAudit } from '@/lib/repos/audit'
import { linkUrl } from '@/lib/validation/url'
import { gradeSchema } from '@/lib/validation/assignment'

// Explicit canManageClass gate on every mutation (don't rely on RLS alone) — an
// RLS-denied update matches 0 rows with no error, which would otherwise report a
// false success.

export async function archiveAssignmentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? 'archived') === 'active' ? 'active' : 'archived'
  if (!id) return
  const assignment = await getAssignment(id)
  if (!assignment || !(await canManageClass(me, assignment.class_id))) return
  await setAssignmentStatus(id, status)
  await writeAudit({
    actor_id: me.id,
    action: `assignment.${status === 'active' ? 'restore' : 'archive'}`,
    entity_type: 'assignment',
    entity_id: id,
  })
  revalidatePath('/classroom', 'layout')
}

/** `due_date` arrives already converted to an ISO instant by the client. */
export async function editAssignmentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const dueIso = String(formData.get('due_date') ?? '')
  const brief = String(formData.get('attachment_drive_link') ?? '').trim()
  if (!id || !title || Number.isNaN(Date.parse(dueIso))) return
  // Same URL-scheme guard as every other link write path — a stored javascript:/
  // data: link would otherwise render as a clickable href for students.
  if (brief && !linkUrl.safeParse(brief).success) return
  const assignment = await getAssignment(id)
  if (!assignment || !(await canManageClass(me, assignment.class_id))) return
  await updateAssignment(id, {
    title,
    description: description || null,
    due_date: new Date(dueIso).toISOString(),
    attachment_drive_link: brief || null,
  })
  await writeAudit({ actor_id: me.id, action: 'assignment.edit', entity_type: 'assignment', entity_id: id })
  revalidatePath('/classroom', 'layout')
}

/**
 * Tutor grades one submission (mark + optional feedback). Service-role write,
 * gated by canManageClass so only a teacher of this class (or an admin) can mark.
 * An empty mark clears a previous score.
 */
export async function gradeSubmissionAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireRole(['admin', 'teacher'])
  const submissionId = String(formData.get('submission_id') ?? '')
  if (!submissionId) return { ok: false, error: 'Missing submission.' }
  const scoreRaw = String(formData.get('score') ?? '').trim()
  const feedbackRaw = String(formData.get('feedback') ?? '').trim()
  const parsed = gradeSchema.safeParse({
    score: scoreRaw === '' ? null : Number(scoreRaw),
    feedback: feedbackRaw || undefined,
  })
  if (!parsed.success) return { ok: false, error: 'Enter a valid mark (0–9999.99).' }

  // Authorize against the submission's OWN assignment/class — NEVER a
  // client-supplied assignment id, which could name a class the caller manages
  // while the write targets a submission in a class they don't.
  const submission = await getSubmission(submissionId)
  if (!submission) return { ok: false, error: 'Not allowed to grade this submission.' }
  // Guard the resubmit race: if the student replaced this submission after the
  // tutor opened the grading UI, this row is now inactive and the report card
  // reads only the active one — so a mark saved here would silently vanish.
  if (!submission.is_active) {
    return { ok: false, error: 'This submission was replaced by a newer one — reload to grade the latest.' }
  }
  const assignment = await getAssignment(submission.assignment_id)
  if (!assignment || !(await canManageClass(me, assignment.class_id))) {
    return { ok: false, error: 'Not allowed to grade this submission.' }
  }
  if (parsed.data.score != null && assignment.max_marks != null && parsed.data.score > Number(assignment.max_marks)) {
    return { ok: false, error: `Mark can’t exceed the maximum (${Number(assignment.max_marks)}).` }
  }
  await gradeSubmission(submissionId, {
    score: parsed.data.score,
    feedback: parsed.data.feedback ?? null,
    gradedBy: me.id,
  })
  await writeAudit({ actor_id: me.id, action: 'submission.grade', entity_type: 'submission', entity_id: submissionId })
  revalidatePath('/classroom', 'layout')
  revalidatePath(`/assignments/${submission.assignment_id}`)
  return { ok: true }
}

/** Soft-remove a material (kept on record via status='archived'). */
export async function deleteResourceAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const resource = await getResource(id)
  if (!resource || !(await canManageClass(me, resource.class_id))) return
  await deleteResource(id)
  await writeAudit({ actor_id: me.id, action: 'resource.delete', entity_type: 'resource', entity_id: id })
  revalidatePath('/classroom', 'layout')
}
