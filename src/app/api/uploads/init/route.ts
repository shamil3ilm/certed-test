import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { uploadInitSchema } from '@/lib/validation/resource'
import { isAllowedType } from '@/lib/drive/validate'
import { getCourse } from '@/lib/repos/courses'
import { createPendingResource, deleteResource } from '@/lib/repos/resources'
import { resolveResourcesFolder } from '@/lib/drive/courseFolder'
import { initResumableSession } from '@/lib/drive/resumable'

export async function POST(req: Request) {
  let me
  try {
    me = await requireRoleApi(['admin', 'teacher'])
  } catch (e) {
    return authFail(e)
  }

  const parsed = uploadInitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)
  if (!isAllowedType(parsed.data.mimeType)) return fail('type-not-allowed', 415)

  const course = await getCourse(parsed.data.course_id)
  if (!course) return fail('course not found', 404)

  // RLS enforces teacher-of-course/admin on this insert.
  let pending
  try {
    pending = await createPendingResource({
      course_id: parsed.data.course_id,
      title: parsed.data.title,
      uploaded_by: me.id,
    })
  } catch {
    return fail('not allowed to upload to this course', 403)
  }

  try {
    const parentId = await resolveResourcesFolder(course.id, course.name)
    const sessionUri = await initResumableSession({
      name: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      parentId,
      size: parsed.data.size,
    })
    return ok({ resource_id: pending.id, sessionUri })
  } catch {
    await deleteResource(pending.id).catch(() => {})
    return fail('failed to start upload', 500)
  }
}
