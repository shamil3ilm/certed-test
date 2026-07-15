import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { writeAudit } from '@/lib/repos/audit'
import { PermissionError, NotFoundError } from '@/lib/errors'

export type Resource = {
  id: string
  class_id: string
  title: string
  drive_link: string | null
  uploaded_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

export async function listResources(classId?: string): Promise<Resource[]> {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw new Error(`resources.list: ${error.message}`)
  return (data ?? []) as Resource[]
}

export async function getResource(id: string): Promise<Resource | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('resources').select('*').eq('id', id).maybeSingle()
  return (data as Resource) ?? null
}

export type CreateLinkResourceInput = {
  class_id: string
  title: string
  drive_link: string
}

/**
 * Creates an active link-based resource (no Drive file upload needed).
 * Enforces canManageClass and writes the audit entry — a caller cannot reach
 * the insert without going through this check.
 */
export async function createLinkResource(actor: Profile, input: CreateLinkResourceInput): Promise<Resource> {
  if (!(await canManageClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .insert({
      class_id: input.class_id,
      title: input.title,
      drive_link: input.drive_link,
      uploaded_by: actor.id,
      status: 'active',
    })
    .select('*')
    .single()
  if (error) throw new Error(`resources.createLink: ${error.message}`)
  const created = data as Resource
  await writeAudit({ actor_id: actor.id, action: 'resource.create', entity_type: 'resource', entity_id: created.id })
  return created
}

/**
 * Soft-remove: archive the resource (kept on record) rather than deleting
 * it. Enforces canManageClass on the resource's own class and writes the
 * audit entry.
 */
export async function archiveResource(actor: Profile, id: string): Promise<void> {
  const resource = await getResource(id)
  if (!resource) throw new NotFoundError('Resource not found')
  if (!(await canManageClass(actor, resource.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`resources.archive: ${error.message}`)
  await writeAudit({ actor_id: actor.id, action: 'resource.delete', entity_type: 'resource', entity_id: id })
}
