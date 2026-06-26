import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { createAssignment } from '@/lib/repos/assignments'

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
      course_id: parsed.data.course_id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_date: new Date(parsed.data.due_date).toISOString(),
      created_by: me.id,
    })
    return ok({ id: a.id })
  } catch {
    return fail('not allowed to create for this course', 403)
  }
}
