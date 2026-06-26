import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { submissionFinalizeSchema } from '@/lib/validation/assignment'
import { decideFinalize } from '@/lib/drive/validate'
import { readFileMeta, trashFile } from '@/lib/drive/resumable'
import { getAssignment } from '@/lib/repos/assignments'
import { recordSubmission } from '@/lib/repos/submissions'

export async function POST(req: Request) {
  let me
  try {
    me = await requireRoleApi(['student'])
  } catch (e) {
    return authFail(e)
  }
  const parsed = submissionFinalizeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)

  const assignment = await getAssignment(parsed.data.assignment_id)
  if (!assignment || assignment.status !== 'active') return fail('assignment not found', 404)

  // Re-read the real file metadata; never trust the client.
  const meta = await readFileMeta(parsed.data.drive_file_id)
  const decision = decideFinalize(meta)
  if (!decision.ok) {
    await trashFile(parsed.data.drive_file_id).catch(() => {})
    return fail(decision.reason, 422)
  }

  try {
    // RLS enforces enrolled + own; status computed from the server clock vs due_date.
    const submission = await recordSubmission({
      assignment_id: assignment.id,
      student_id: me.id,
      drive_file_id: parsed.data.drive_file_id,
      drive_link: null,
      due_date: assignment.due_date,
    })
    return ok({ submission_id: submission.id, status: submission.status })
  } catch {
    await trashFile(parsed.data.drive_file_id).catch(() => {})
    return fail('failed to record submission', 500)
  }
}
