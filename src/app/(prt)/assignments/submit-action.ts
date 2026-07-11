'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment } from '@/lib/repos/assignments'
import { recordSubmission } from '@/lib/repos/submissions'
import { submissionInputSchema } from '@/lib/assignments/submitSchema'

/**
 * Submit work as a Google Drive link — pasted, or picked via the Drive Picker
 * (which uploads to the student's own Drive and returns its share URL).
 * RLS enforces enrolled + own; the status is computed server-side vs the due date.
 */
export async function submitLinkAction(formData: FormData) {
  const me = await requireRole(['student'])
  const parsed = submissionInputSchema.safeParse({
    assignment_id: String(formData.get('assignment_id') ?? ''),
    url: String(formData.get('url') ?? ''),
    file_name: formData.get('file_name') ? String(formData.get('file_name')) : undefined,
  })
  if (!parsed.success) throw new Error('Please paste a valid link')

  const assignment = await getAssignment(parsed.data.assignment_id)
  if (!assignment || assignment.status !== 'active') throw new Error('Assignment not found')

  await recordSubmission({
    assignment_id: assignment.id,
    student_id: me.id,
    drive_link: parsed.data.url,
    file_name: parsed.data.file_name ?? null,
    due_date: assignment.due_date,
  })
  revalidatePath('/classroom', 'layout')
  revalidatePath('/assignments', 'layout')
}
