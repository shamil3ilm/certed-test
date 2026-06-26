import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { submissionInitSchema } from '@/lib/validation/assignment'
import { isAllowedType } from '@/lib/drive/validate'
import { getAssignment } from '@/lib/repos/assignments'
import { getCourse } from '@/lib/repos/courses'
import { resolveSubmissionsFolder } from '@/lib/drive/courseFolder'
import { initResumableSession } from '@/lib/drive/resumable'

export async function POST(req: Request) {
  try {
    await requireRoleApi(['student'])
  } catch (e) {
    return authFail(e)
  }
  const parsed = submissionInitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)
  if (!isAllowedType(parsed.data.mimeType)) return fail('type-not-allowed', 415)

  // RLS: a student can read the assignment only if enrolled + it's active.
  const assignment = await getAssignment(parsed.data.assignment_id)
  if (!assignment || assignment.status !== 'active') return fail('assignment not found', 404)
  const course = await getCourse(assignment.course_id)
  if (!course) return fail('course not found', 404)

  try {
    const parentId = await resolveSubmissionsFolder(course.id, course.name)
    const sessionUri = await initResumableSession({
      name: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      parentId,
      size: parsed.data.size,
    })
    return ok({ sessionUri })
  } catch {
    return fail('failed to start upload', 500)
  }
}
