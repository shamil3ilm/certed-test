import { ok, fail, authFail } from '@/lib/api/response'
import { requireRoleApi } from '@/lib/auth/requireRole'
import { uploadFinalizeSchema } from '@/lib/validation/resource'
import { decideFinalize } from '@/lib/drive/validate'
import { readFileMeta, trashFile } from '@/lib/drive/resumable'
import { getResource, activateResource, deleteResource } from '@/lib/repos/resources'

export async function POST(req: Request) {
  try {
    await requireRoleApi(['admin', 'teacher'])
  } catch (e) {
    return authFail(e)
  }

  const parsed = uploadFinalizeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail('invalid input', 422)

  const resource = await getResource(parsed.data.resource_id)
  if (!resource) return fail('resource not found', 404)

  // Trust nothing the client claimed — re-read the real file metadata from Drive.
  const meta = await readFileMeta(parsed.data.drive_file_id)
  const decision = decideFinalize(meta)
  if (!decision.ok) {
    await trashFile(parsed.data.drive_file_id).catch(() => {})
    await deleteResource(resource.id).catch(() => {})
    return fail(decision.reason, 422)
  }

  await activateResource(resource.id, parsed.data.drive_file_id, null)
  return ok({ resource_id: resource.id, status: 'active' })
}
