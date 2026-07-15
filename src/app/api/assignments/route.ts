import { ok, fail, authFail, apiError } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { createAssignment } from '@/lib/services/assignments'

export async function POST(req: Request) {
  let me
  try {
    me = await requireRoleApi(['admin', 'teacher'])
  } catch (e) {
    return authFail(e)
  }
  const parsed = createAssignmentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)
  try {
    const a = await createAssignment(me, {
      class_id: parsed.data.class_id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_date: new Date(parsed.data.due_date).toISOString(),
      attachment_drive_link: parsed.data.attachment_drive_link ?? null,
      topic: parsed.data.topic ?? null,
      max_marks: parsed.data.max_marks ?? null,
    })
    return ok({ id: a.id })
  } catch (e) {
    return apiError(e)
  }
}
