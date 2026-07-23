import 'server-only'
import {
  insertResource,
  selectRecentForClasses,
  selectResourceById,
  selectResourcePage,
  updateResourceStatus,
  type ResourceRow,
} from '@/lib/data/resources'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireManageableResource } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { linkUrl } from '@/lib/validation/url'
import { z } from 'zod'

export type Resource = ResourceRow

export type PaginatedResources = { items: Resource[]; total: number }

/** Paginated read of a class's materials list (SQL-side range + count), so the
 *  classwork page loads one bounded page rather than every active resource. */
export async function listResourcesPage(
  classId: string,
  opts: { page: number; pageSize: number; status?: 'active' | 'archived'; search?: string },
): Promise<PaginatedResources> {
  const from = (opts.page - 1) * opts.pageSize
  const { rows, total } = await selectResourcePage(classId, {
    from,
    to: from + opts.pageSize - 1,
    status: opts.status ?? 'active',
    search: opts.search,
  })
  return { items: rows, total }
}

/** Newest resources across a tutor's classes - the dashboard's "recent
 *  uploads" widget. SQL-side `.in()` + `.limit()`, not a full-table fetch. */
export async function listRecentResourcesForClasses(classIds: string[], limit = 5): Promise<Resource[]> {
  return selectRecentForClasses(classIds, limit)
}

export async function getResource(id: string): Promise<Resource | null> {
  return selectResourceById(id)
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

export function validateCreateLinkResourceInput(input: CreateLinkResourceActionInput): CreateLinkResourceInput {
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
 * Enforces canManageClass and writes the audit entry - a caller cannot reach
 * the insert without going through this check.
 */
export async function createLinkResource(actor: Profile, input: CreateLinkResourceInput): Promise<Resource> {
  if (!(await canManageClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  const created = await insertResource({
    class_id: input.class_id,
    title: input.title,
    drive_link: input.drive_link,
    uploaded_by: actor.id,
    status: 'active',
  })
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
  await updateResourceStatus(id, 'archived')
  await auditPrivilegedAction(actor, 'resource.delete', 'resource', id)
}

export async function archiveResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await archiveResource(actor, validateResourceIdInput(input))
}

/** Undoes archiveResource - the "kept on record" promise in the archive
 *  confirmation dialog previously had no matching UI action. */
export async function restoreResource(actor: Profile, id: string): Promise<void> {
  await requireManageableResource(actor, id, getResource)
  await updateResourceStatus(id, 'active')
  await auditPrivilegedAction(actor, 'resource.restore', 'resource', id)
}

export async function restoreResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await restoreResource(actor, validateResourceIdInput(input))
}
