'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { archiveAssignment, editAssignment } from '@/lib/services/assignments'
import { gradeSubmission } from '@/lib/services/submissions'
import { archiveResource } from '@/lib/services/resources'
import { linkUrl } from '@/lib/validation/url'
import { gradeSchema } from '@/lib/validation/assignment'
import { ServiceError } from '@/lib/errors'

// Permission check + audit on every mutation now happens inside each service
// — not swallowed to a no-op here, thrown errors propagate to the portal
// error boundary (or, for actions with a structured return, are mapped to
// { ok: false, error }).

export async function archiveAssignmentAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? 'archived') === 'active' ? 'active' : 'archived'
  if (!id) return
  await archiveAssignment(me, id, status)
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
  await editAssignment(me, id, {
    title,
    description: description || null,
    due_date: new Date(dueIso).toISOString(),
    attachment_drive_link: brief || null,
  })
  revalidatePath('/classroom', 'layout')
}

/**
 * Tutor grades one submission (mark + optional feedback). Permission check,
 * grading-race guard, max-marks validation, and audit all happen inside the
 * service. An empty mark clears a previous score.
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

  try {
    const { assignmentId } = await gradeSubmission(me, {
      submissionId,
      score: parsed.data.score,
      feedback: parsed.data.feedback ?? null,
    })
    revalidatePath('/classroom', 'layout')
    revalidatePath(`/assignments/${assignmentId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ServiceError ? e.message : 'Something went wrong. Please try again.' }
  }
}

/** Soft-remove a material (kept on record via status='archived'). Permission
 *  check + audit happen inside the service; a not-found/not-authorized error
 *  propagates to the portal error boundary, same as every other action's
 *  thrown errors (not swallowed to a silent no-op). */
export async function deleteResourceAction(formData: FormData) {
  const me = await requireRole(['admin', 'teacher'])
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await archiveResource(me, id)
  revalidatePath('/classroom', 'layout')
}
