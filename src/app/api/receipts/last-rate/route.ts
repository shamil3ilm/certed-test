import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { lastRateForStudent } from '@/lib/repos/receipts'

export async function GET(req: Request) {
  try {
    await requireRoleApi(['admin'])
  } catch (e) {
    return authFail(e)
  }
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('student_id')
  const subject = searchParams.get('subject')
  if (!studentId || !subject) return fail('missing params', 422)
  const rate = await lastRateForStudent(studentId, subject)
  return ok({ rate })
}
