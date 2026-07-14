import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.add'
  | 'user.revoke'
  | 'user.restore'
  | 'class.create'
  | 'class.archive'
  | (string & {})

export type AuditRow = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
}

/** Recent audit entries, newest first, for the admin activity log. Service-role
 *  read (the page gates to admin; audit_read RLS is admin-only too). */
export async function listAudit(limit = 250): Promise<AuditRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('audit_log')
    .select('id, actor_id, action, entity_type, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`audit.list: ${error.message}`)
  return (data ?? []) as AuditRow[]
}

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
