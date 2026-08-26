import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import {
  deleteEntityTag,
  insertEntityTag,
  insertTag,
  selectAllTags,
  selectEntityIdsForTag,
  selectTagsForEntities,
  selectTagsForEntity,
  type TagRow,
} from '@/lib/data/tags'
import { PermissionError, ValidationError, NotFoundError } from '@/lib/errors'
import { canManageClass } from '@/lib/permission'
import { assertCanDocument } from '@/lib/permission/documents'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { getResource } from '@/lib/services/resources'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { z } from 'zod'

/**
 * Tagging domain: one label vocabulary + polymorphic attachments, so the SAME
 * system organises classes, documents and (later) other entities. Reads are open
 * (labels); every write is gated - creating a tag needs staff, and attaching a tag
 * needs permission for THAT entity (a tutor tags a class they manage; an admin
 * tags anything). New taggable types are added in assertCanTagEntity, nowhere else.
 */

export type Tag = TagRow

/** Entity types that can be tagged today. Add a case in assertCanTagEntity to
 *  extend the system to a new type. */
export type TaggableType = 'class' | 'resource'

const tagNameSchema = z.string().trim().min(1).max(40)
const TAG_COLORS = ['slate', 'primary', 'emerald', 'amber', 'rose', 'sky', 'violet'] as const
const colorSchema = z
  .enum(TAG_COLORS)
  .nullable()
  .optional()
  .transform((v) => v ?? null)

export const TAG_TONES = TAG_COLORS

async function assertIsStaff(actor: Profile): Promise<void> {
  const flags = await loadPersonaFlags(actor.id)
  if (!flags.isAdmin && !flags.isTutor && !flags.hasMentorAuthority) {
    throw new PermissionError('Only staff can manage tags.')
  }
}

/** Permission to attach/detach a tag on a specific entity, by type. This is the
 *  single place that knows how each taggable type is authorized. */
async function assertCanTagEntity(actor: Profile, type: TaggableType, entityId: string): Promise<void> {
  if (type === 'class') {
    if (!(await canManageClass(actor, entityId))) throw new PermissionError('Not authorized to tag this class.')
    return
  }
  if (type === 'resource') {
    const doc = await getResource(entityId)
    if (!doc) throw new NotFoundError('Document not found')
    await assertCanDocument(actor, 'edit', doc)
    return
  }
  throw new ValidationError('This item type cannot be tagged yet.')
}

// Reads: open tag vocabulary + resolved entity attachments.
export function listTags(): Promise<Tag[]> {
  return selectAllTags()
}

export function tagsForEntity(type: TaggableType, entityId: string): Promise<Tag[]> {
  return selectTagsForEntity(type, entityId)
}

export function tagsForEntities(type: TaggableType, entityIds: string[]): Promise<Map<string, Tag[]>> {
  return selectTagsForEntities(type, entityIds)
}

export function entityIdsForTag(type: TaggableType, tagId: string): Promise<string[]> {
  // tagId reaches the query as a uuid column comparison. A caller can pass an
  // attacker-controlled value straight from a `?tag=` query param, and a non-uuid
  // string makes Postgres raise 22P02 (invalid_text_representation) -> an
  // unhandled 500 (A-13). An invalid tag simply matches nothing, so fail closed
  // to an empty result instead of erroring.
  if (!z.string().uuid().safeParse(tagId).success) return Promise.resolve([])
  return selectEntityIdsForTag(type, tagId)
}

// Writes: staff-only tag creation and entity-scoped attach/detach operations.
/** Get an existing tag by name (case-insensitive) or create it. Staff only. */
export async function createTag(actor: Profile, name: string, color?: string | null): Promise<Tag> {
  await assertIsStaff(actor)
  const parsedName = tagNameSchema.parse(name)
  const parsedColor = colorSchema.parse(color)
  const existing = (await selectAllTags()).find((t) => t.name.toLowerCase() === parsedName.toLowerCase())
  if (existing) return existing
  const created = await insertTag({ name: parsedName, color: parsedColor, created_by: actor.id })
  await auditPrivilegedAction(actor, 'tag.create', 'tag', created.id)
  return created
}

/** Attach an existing tag to an entity the caller may manage. */
export async function tagEntity(actor: Profile, type: TaggableType, entityId: string, tagId: string): Promise<void> {
  await assertCanTagEntity(actor, type, entityId)
  await insertEntityTag({ tag_id: tagId, entity_type: type, entity_id: entityId, created_by: actor.id })
  await auditPrivilegedAction(actor, 'tag.attach', type, entityId)
}

/** Create-or-get a tag by name and attach it - the free-text "add tag" path. */
export async function applyTagByName(
  actor: Profile,
  type: TaggableType,
  entityId: string,
  name: string,
  color?: string | null,
): Promise<Tag> {
  await assertCanTagEntity(actor, type, entityId)
  const tag = await createTag(actor, name, color)
  await insertEntityTag({ tag_id: tag.id, entity_type: type, entity_id: entityId, created_by: actor.id })
  await auditPrivilegedAction(actor, 'tag.attach', type, entityId)
  return tag
}

export async function untagEntity(actor: Profile, type: TaggableType, entityId: string, tagId: string): Promise<void> {
  await assertCanTagEntity(actor, type, entityId)
  await deleteEntityTag(tagId, type, entityId)
  await auditPrivilegedAction(actor, 'tag.detach', type, entityId)
}
