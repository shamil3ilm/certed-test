import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeIlike } from '@/lib/text/ilike'

/**
 * Table access for `audit_log`. Moved here from src/lib/repos, the last file of
 * the old repos layer - it was already a data module in everything but name.
 *
 * Service-role both ways. audit_log has no self-service policy by design: a
 * user must not be able to read or amend the record of what they did, so
 * reading is gated in the domain (the history page) rather than by RLS.
 */

export type AuditAction = 'user.add' | 'user.revoke' | 'user.restore' | 'class.create' | 'class.archive' | (string & {})

export type AuditRow = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
}

export type PaginatedAudit = { items: AuditRow[]; total: number }

/**
 * Paginated + filtered read of the activity log. Action is a free-text ilike
 * match (e.g. "grade" matches "submission.grade"); actorIds narrows to specific
 * actors, resolved by the caller (a name/email search against profiles) since
 * audit_log only stores actor_id, not a name.
 */
export async function listAuditPage(opts: {
  page: number
  pageSize: number
  action?: string
  actorIds?: string[]
}): Promise<PaginatedAudit> {
  const admin = createAdminClient()
  const from = (opts.page - 1) * opts.pageSize
  const to = from + opts.pageSize - 1
  let query = admin
    .from('audit_log')
    .select('id, actor_id, action, entity_type, entity_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  const action = opts.action?.trim()
  if (action) query = query.ilike('action', `%${escapeIlike(action)}%`)
  if (opts.actorIds) query = query.in('actor_id', opts.actorIds)
  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(`audit.listPage: ${error.message}`)
  return { items: (data ?? []) as AuditRow[], total: count ?? 0 }
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
