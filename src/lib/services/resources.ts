import 'server-only'
import {
  insertResource,
  selectRecentForClasses,
  selectResourceById,
  selectResourcePage,
  updateResource,
  updateResourceStatus,
  type ResourceRow,
} from '@/lib/data/resources'
import type { Profile } from '@/lib/auth/profile'
import { canManageClass, assertClassActive } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { requireManageableResource } from '@/lib/services/service-helpers'
import { PermissionError, ValidationError } from '@/lib/errors'
import { throttleWrite } from '@/lib/security/throttle'
import { linkUrl } from '@/lib/validation/url'
import { titleField } from '@/lib/validation/fields'
import { validateUuidField } from '@/lib/validation/id'
import { z } from 'zod'

export type Resource = ResourceRow

type PaginatedResources = { items: Resource[]; total: number }

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

type CreateLinkResourceInput = {
  class_id: string
  title: string
  drive_link: string
}

const createLinkResourceInputSchema = z.object({
  class_id: z.string().uuid(),
  title: titleField,
  drive_link: linkUrl,
})

type CreateLinkResourceActionInput = {
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

type ResourceIdActionInput = {
  id?: FormDataEntryValue | null
}

export function validateResourceIdInput(input: ResourceIdActionInput): string {
  return validateUuidField(input.id, 'Invalid resource id')
}

/**
 * Creates an active link-based resource (no Drive file upload needed).
 * Enforces canManageClass and writes the audit entry - a caller cannot reach
 * the insert without going through this check.
 */
export async function createLinkResource(actor: Profile, input: CreateLinkResourceInput): Promise<Resource> {
  throttleWrite('resource', actor.id, 'resource')
  if (!(await canManageClass(actor, input.class_id))) {
    throw new PermissionError('Not authorized for this class')
  }
  await assertClassActive(input.class_id)
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

type EditLinkResourceInput = { id: string; title: string; drive_link: string }

const editLinkResourceInputSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  drive_link: linkUrl,
})

type EditLinkResourceActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
}

export function validateEditLinkResourceInput(input: EditLinkResourceActionInput): EditLinkResourceInput {
  const parsed = editLinkResourceInputSchema.safeParse({
    id: String(input.id ?? ''),
    title: input.title,
    drive_link: input.url,
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid material data')
  }
  return parsed.data
}

/**
 * Edit a material's title and link. Enforces canManageClass on the resource's
 * own class (via requireManageableResource) and audits - the same authorization
 * as archive/restore. Editing metadata isn't gated on class-active, matching how
 * assignments and announcements can be edited after their class is archived.
 */
export async function editResource(actor: Profile, input: EditLinkResourceInput): Promise<void> {
  throttleWrite('resource', actor.id, 'resource')
  await requireManageableResource(actor, input.id, getResource)
  await updateResource(input.id, { title: input.title, drive_link: input.drive_link })
  await auditPrivilegedAction(actor, 'resource.edit', 'resource', input.id)
}

export async function editResourceFromActionInput(actor: Profile, input: EditLinkResourceActionInput): Promise<void> {
  return editResource(actor, validateEditLinkResourceInput(input))
}

/**
 * Soft-remove: archive the resource (kept on record) rather than deleting
 * it. Enforces canManageClass on the resource's own class and writes the
 * audit entry.
 */
export async function archiveResource(actor: Profile, id: string): Promise<void> {
  throttleWrite('resource', actor.id, 'resource')
  await requireManageableResource(actor, id, getResource)
  await updateResourceStatus(id, 'archived')
  await auditPrivilegedAction(actor, 'resource.delete', 'resource', id)
}

export async function archiveResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await archiveResource(actor, validateResourceIdInput(input))
}

/** Undoes archiveResource, honouring the "kept on record" promise shown in the
 *  archive confirmation dialog. */
export async function restoreResource(actor: Profile, id: string): Promise<void> {
  throttleWrite('resource', actor.id, 'resource')
  const resource = await requireManageableResource(actor, id, getResource)
  // Restoring re-activates content on the class - same rule as create/upload: no
  // active material on an archived (soft-deleted) class.
  await assertClassActive(resource.class_id)
  await updateResourceStatus(id, 'active')
  await auditPrivilegedAction(actor, 'resource.restore', 'resource', id)
}

export async function restoreResourceFromActionInput(actor: Profile, input: ResourceIdActionInput): Promise<void> {
  await restoreResource(actor, validateResourceIdInput(input))
}
