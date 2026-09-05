import { writeAudit } from '@/lib/data/audit'
import type { Profile } from '@/lib/auth/profile'

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
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await writeAudit({
    actor_id: actor.id,
    action,
    entity_type,
    entity_id,
    // Only carry metadata when there is some - a plain audit call stays exactly as before.
    ...(metadata != null ? { metadata } : {}),
  })
}
