import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { lastRateForTeacher } from '@/lib/repos/payslips'

export async function GET(req: Request) {
  try {
    await requireRoleApi(['admin'])
  } catch (e) {
    return authFail(e)
  }
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacher_id')
  const label = searchParams.get('label')
  if (!teacherId || !label) return fail('missing params', 422)
  const rate = await lastRateForTeacher(teacherId, label)
  return ok({ rate })
}
