import { writeAudit } from '@/lib/data/audit'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { NotFoundError, PermissionError } from '@/lib/errors'

/**
 * Writes the audit row for a privileged operation, taking the actor context
 * directly. Call after the authorization check + mutation succeed:
 *
 *   await requireAdminPersona(actor)
 *   await admin.from('classes').update({ status: 'archived' }).eq('id', id)
 *   await auditPrivilegedAction(actor, 'class.archive', 'class', id)
 */
export async function auditPrivilegedAction(
  actor: Pick<Profile, 'id'>,
  action: string,
  entity_type: string,
  entity_id: string | null,
): Promise<void> {
  await writeAudit({
    actor_id: actor.id,
    action,
    entity_type,
    entity_id,
  })
}

/**
 * Fetch a resource and verify the actor has permission to manage its class.
 * Throws NotFoundError if resource doesn't exist, PermissionError if not authorized.
 * Extracted common pattern from archiveResource, restoreResource.
 */
export async function requireManageableResource(
  actor: Profile,
  resourceId: string,
  getResourceFn: (id: string) => Promise<{ class_id: string } | null>,
): Promise<{ class_id: string }> {
  const resource = await getResourceFn(resourceId)
  if (!resource) throw new NotFoundError('Resource not found')
  if (!(await canManageClass(actor, resource.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  return resource
}
