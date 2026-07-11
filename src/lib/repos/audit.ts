import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.add'
  | 'user.revoke'
  | 'user.restore'
  | 'class.create'
  | 'class.archive'
  | (string & {})

/** Records a sensitive action. Uses the service-role client (server-only). */
export async function writeAudit(entry: {
  actor_id: string | null
  action: AuditAction
  entity_type: string
  entity_id?: string | null
}): Promise<void> {
  // Best-effort: an audit failure must never break the primary action.
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      actor_id: entry.actor_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
    })
  } catch {
    /* swallow */
  }
}
