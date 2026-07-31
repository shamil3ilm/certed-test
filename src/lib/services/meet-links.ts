import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  insertMeetLink,
  selectMeetLinkById,
  selectMeetLinks,
  selectNewestForClasses,
  setMeetLinkActive,
  updateMeetLink,
  type MeetLinkRow,
} from '@/lib/data/meet-links'
import { canManageScope, assertClassActive } from '@/lib/permission'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'
import { linkUrl } from '@/lib/validation/url'
import { titleField } from '@/lib/validation/fields'
import { z } from 'zod'

export type MeetLink = MeetLinkRow

/** Newest first, ties left in encounter order. */
const byNewest = (a: MeetLink, b: MeetLink): number =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0

export async function listMeetLinks(classId?: string, includeInactive = false): Promise<MeetLink[]> {
  const rows = await selectMeetLinks(includeInactive)
  // A class view includes academy-wide (null) links too; no classId = global listing.
  return classId ? rows.filter((m) => m.class_id === classId || m.class_id === null) : rows
}

/**
 * Newest active meet links across a set of classes, plus academy-wide ones -
 * the dashboard's "meeting links" widget. Named for what the data actually is
 * (recently posted links, sorted by `created_at`): meet_links has no
 * scheduled-time column, so there's no way to derive a genuine "upcoming"
 * (time-ordered) list without a schema change.
 */
export async function listMeetLinksForClasses(classIds: string[], limit = 5): Promise<MeetLink[]> {
  const { classRows, globalRows } = await selectNewestForClasses(classIds, limit)
  return [...classRows, ...globalRows].sort(byNewest).slice(0, limit)
}

async function getMeetLink(id: string): Promise<MeetLink | null> {
  return selectMeetLinkById(id)
}

type CreateMeetLinkInput = {
  class_id: string | null
  title: string
  url: string
  description?: string | null
  scheduled_at?: string | null
}

// The client (MeetForm) converts its datetime-local value to a strict ISO instant
// before submitting; an empty field arrives as null (an always-available link).
const scheduledAtField = z.string().datetime().nullable()

const createMeetLinkInputSchema = z.object({
  class_id: z.string().uuid().nullable(),
  title: titleField,
  url: linkUrl,
  description: z.string().trim().max(1000).optional(),
  scheduled_at: scheduledAtField,
})

type CreateMeetLinkActionInput = {
  classId?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  scheduled_at?: FormDataEntryValue | null
}

export function validateCreateMeetLinkInput(input: CreateMeetLinkActionInput): CreateMeetLinkInput {
  const rawClassId = input.classId
  const class_id = rawClassId === '' || rawClassId === 'global' ? null : (rawClassId as string | null)
  const parsed = createMeetLinkInputSchema.safeParse({
    class_id,
    title: input.title,
    url: input.url,
    description: input.description,
    scheduled_at: String(input.scheduled_at ?? '').trim() || null,
  })

  if (!parsed.success) {
    throw new ValidationError(`Invalid meet link data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }

  return { ...parsed.data, scheduled_at: parsed.data.scheduled_at }
}

/**
 * A class meet requires managing that class; a global meet (null) is
 * admin-only. Enforces canManageScope and writes a `meet.create` audit entry.
 */
export async function createMeetLink(actor: Profile, input: CreateMeetLinkInput): Promise<MeetLink> {
  if (!(await canManageScope(actor, input.class_id))) {
    throw new PermissionError('Not allowed to post a meet link to this class')
  }
  if (input.class_id) await assertClassActive(input.class_id)
  const created = await insertMeetLink({
    class_id: input.class_id,
    title: input.title,
    url: input.url,
    description: input.description ?? null,
    scheduled_at: input.scheduled_at ?? null,
    created_by: actor.id,
    active: true,
  })
  await auditPrivilegedAction(actor, 'meet.create', 'meet_link', created.id)
  return created
}

type EditMeetLinkActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  url?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  scheduled_at?: FormDataEntryValue | null
}

const editMeetLinkInputSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  url: linkUrl,
  description: z.string().trim().max(1000).optional(),
  scheduled_at: scheduledAtField,
})

/** Edit a meet link's title / url / description / scheduled time. Gated on
 *  managing the link's own class (or academy-wide for an admin), like delete. */
export async function editMeetLinkFromActionInput(actor: Profile, input: EditMeetLinkActionInput): Promise<void> {
  const parsed = editMeetLinkInputSchema.safeParse({
    id: String(input.id ?? ''),
    title: input.title,
    url: input.url,
    description: input.description,
    scheduled_at: String(input.scheduled_at ?? '').trim() || null,
  })
  if (!parsed.success) {
    throw new ValidationError(`Invalid meet link data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }
  const link = await getMeetLink(parsed.data.id)
  if (!link) throw new NotFoundError('Meet link not found')
  if (!(await canManageScope(actor, link.class_id))) {
    throw new PermissionError('Not authorized for this meet link')
  }
  await updateMeetLink(parsed.data.id, {
    title: parsed.data.title,
    url: parsed.data.url,
    description: parsed.data.description ?? null,
    scheduled_at: parsed.data.scheduled_at,
  })
  await auditPrivilegedAction(actor, 'meet.edit', 'meet_link', parsed.data.id)
}

export async function createMeetLinkFromActionInput(
  actor: Profile,
  input: CreateMeetLinkActionInput,
): Promise<MeetLink> {
  return createMeetLink(actor, validateCreateMeetLinkInput(input))
}

/**
 * Soft-remove: deactivate the link (kept on record) rather than deleting it.
 * Enforces canManageScope on the link's own class and writes the audit entry
 * (also a new behavior addition - see createMeetLink).
 */
export async function deleteMeetLink(actor: Profile, id: string): Promise<void> {
  const link = await getMeetLink(id)
  if (!link) throw new NotFoundError('Meet link not found')
  if (!(await canManageScope(actor, link.class_id))) {
    throw new PermissionError('Not authorized for this meet link')
  }
  await setMeetLinkActive(id, false)
  await auditPrivilegedAction(actor, 'meet.delete', 'meet_link', id)
}

/** Undoes deleteMeetLink - the "kept on record" promise in the removal
 *  confirmation dialog previously had no matching UI action. */
export async function restoreMeetLink(actor: Profile, id: string): Promise<void> {
  const link = await getMeetLink(id)
  if (!link) throw new NotFoundError('Meet link not found')
  if (!(await canManageScope(actor, link.class_id))) {
    throw new PermissionError('Not authorized for this meet link')
  }
  // Re-activating is placing content back on the class - hold it to the same rule
  // as create: no active content on an archived (soft-deleted) class.
  if (link.class_id) await assertClassActive(link.class_id)
  await setMeetLinkActive(id, true)
  await auditPrivilegedAction(actor, 'meet.restore', 'meet_link', id)
}
