import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.add'
  | 'user.revoke'
  | 'user.restore'
  | 'course.create'
  | 'course.archive'
  | (string & {})

export type AuditEntry = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
}

/** Lists recent audit entries (admin history), newest first, optionally by department. */
export async function listAuditLog(
  opts: { entityType?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const admin = createAdminClient()
  let q = admin
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 150)
  if (opts.entityType) q = q.eq('entity_type', opts.entityType)
  const { data, error } = await q
  if (error) throw new Error(`audit.list: ${error.message}`)
  return (data ?? []) as AuditEntry[]
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
