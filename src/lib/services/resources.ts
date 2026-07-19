import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireManageableResource } from '@/lib/services/service-helpers'
import { escapeIlike } from '@/lib/text/ilike'
import { PermissionError, ValidationError } from '@/lib/errors'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

export type Resource = {
  id: string
  class_id: string
  title: string
  drive_link: string | null
  uploaded_by: string | null
  status: 'active' | 'archived'
  created_at: string
}

export type PaginatedResources = { items: Resource[]; total: number }

/** Paginated read of a class's materials list (SQL-side range + count), so the
 *  classwork page loads one bounded page rather than every active resource. */
export async function listResourcesPage(
  classId: string,
  opts: { page: number; pageSize: number; status?: 'active' | 'archived'; search?: string },
): Promise<PaginatedResources> {
  const supabase = await createClient()
  const from = (opts.page - 1) * opts.pageSize
  const to = from + opts.pageSize - 1
  let query = supabase
    .from('resources')
    .select('*', { count: 'exact' })
    .eq('class_id', classId)
    .eq('status', opts.status ?? 'active')
    .order('created_at', { ascending: false })
  const search = opts.search?.trim()
  if (search) query = query.ilike('title', `%${escapeIlike(search)}%`)
  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(`resources.listPage: ${error.message}`)
  return { items: (data ?? []) as Resource[], total: count ?? 0 }
}

/** Newest resources across a tutor's classes — the dashboard's "recent
 *  uploads" widget. SQL-side `.in()` + `.limit()`, not a full-table fetch. */
export async function listRecentResourcesForClasses(classIds: string[], limit = 5): Promise<Resource[]> {
  if (classIds.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .in('class_id', classIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`resources.listRecentForClasses: ${error.message}`)
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

const resourceIdSchema = z.string().uuid()

const createLinkResourceInputSchema = z.object({
  class_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  drive_link: linkUrl,
})

export type CreateLinkResourceActionInput = {
  classId?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
}

export function validateCreateLinkResourceInput(
  input: CreateLinkResourceActionInput,
): CreateLinkResourceInput {
  const parsed = createLinkResourceInputSchema.safeParse({
    class_id: input.classId,
    title: input.title,
    drive_link: input.url,
  })

  if (!parsed.success) {
    throw new ValidationError('Invalid link resource data')
  }

  return parsed.data
}

export type ResourceIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateResourceIdInput(input: ResourceIdActionInput): string {
  const parsed = resourceIdSchema.safeParse(String(input.id ?? ''))
  if (!parsed.success) {
    throw new ValidationError('Invalid resource id')
  }
  return parsed.data
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
  await auditPrivilegedAction(actor, 'resource.create', 'resource', created.id)
  return created
}

export async function createLinkResourceFromActionInput(
  actor: Profile,
  input: CreateLinkResourceActionInput,
): Promise<Resource> {
  return createLinkResource(actor, validateCreateLinkResourceInput(input))
}

/**
 * Soft-remove: archive the resource (kept on record) rather than deleting
 * it. Enforces canManageClass on the resource's own class and writes the
 * audit entry.
 */
export async function archiveResource(actor: Profile, id: string): Promise<void> {
  await requireManageableResource(actor, id, getResource)
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status: 'archived' }).eq('id', id)
  if (error) throw new Error(`resources.archive: ${error.message}`)
  await auditPrivilegedAction(actor, 'resource.delete', 'resource', id)
}

export async function archiveResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await archiveResource(actor, validateResourceIdInput(input))
}

/** Undoes archiveResource — the "kept on record" promise in the archive
 *  confirmation dialog previously had no matching UI action. */
export async function restoreResource(actor: Profile, id: string): Promise<void> {
  await requireManageableResource(actor, id, getResource)
  const supabase = await createClient()
  const { error } = await supabase.from('resources').update({ status: 'active' }).eq('id', id)
  if (error) throw new Error(`resources.restore: ${error.message}`)
  await auditPrivilegedAction(actor, 'resource.restore', 'resource', id)
}

export async function restoreResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await restoreResource(actor, validateResourceIdInput(input))
}
