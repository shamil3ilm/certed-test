import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { createAssignment } from '@/lib/repos/assignments'
import { writeAudit } from '@/lib/repos/audit'

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
    // RLS enforces teacher-of-course/admin on insert.
    const a = await createAssignment({
      class_id: parsed.data.class_id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_date: new Date(parsed.data.due_date).toISOString(),
      attachment_drive_link: parsed.data.attachment_drive_link ?? null,
      created_by: me.id,
    })
    await writeAudit({ actor_id: me.id, action: 'assignment.create', entity_type: 'assignment', entity_id: a.id })
    return ok({ id: a.id })
  } catch {
    return fail('not allowed to create for this course', 403)
  }
}
