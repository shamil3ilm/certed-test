import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { issueReceiptSchema } from '@/lib/validation/finance'
import { issueReceipt } from '@/lib/finance/issue'

export async function POST(req: Request) {
  let me
  try {
    me = await requireRoleApi(['admin'])
  } catch (e) {
    return authFail(e)
  }
  const parsed = issueReceiptSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)
  try {
    const result = await issueReceipt(parsed.data, me.id)
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'issue failed', 500)
  }
}
