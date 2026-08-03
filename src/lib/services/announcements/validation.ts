import { ValidationError } from '@/lib/errors'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { titleField } from '@/lib/validation/fields'
import { linkUrl } from '@/lib/validation/url'
import type { Attachment } from '@/lib/documents/preview'
import { z } from 'zod'

/** Raw form values -> trusted inputs. Pure: no IO, no authorization. */

const MAX_ATTACHMENTS = 10

export type CreateAnnouncementInput = {
  class_id: string | null
  title: string
  message: string
  attachments: Attachment[]
  publish_at: string | null
  expires_at: string | null
}

export type AnnouncementEditPatch = {
  title: string
  message: string
  attachments: Attachment[]
  publish_at: string | null
  expires_at: string | null
}

const editAnnouncementInputSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  message: z.string().trim().min(1).max(5000),
})

type ScheduleFields = {
  attachments?: FormDataEntryValue | null
  publish_at?: FormDataEntryValue | null
  expires_at?: FormDataEntryValue | null
}

export type CreateAnnouncementActionInput = ScheduleFields & {
  class_id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

export type EditAnnouncementActionInput = ScheduleFields & {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  message?: FormDataEntryValue | null
}

/** Attachments arrive as a newline-separated list of links (one per line). Each
 *  is validated as an http(s) URL; empty lines are ignored. */
function parseAttachments(raw: FormDataEntryValue | null | undefined): Attachment[] {
  const lines = String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length > MAX_ATTACHMENTS) {
    throw new ValidationError(`Too many attachments (max ${MAX_ATTACHMENTS}).`)
  }
  return lines.map((url) => {
    const parsed = linkUrl.safeParse(url)
    if (!parsed.success) throw new ValidationError(`Invalid attachment link: ${url}`)
    return { url: parsed.data }
  })
}

/** A scheduled publish / expiry DATE (YYYY-MM-DD). Publish starts at the day's
 *  start; expiry ends at the day's end. Empty -> null (always live / never
 *  expires). Coarse day-granularity avoids the timezone ambiguity of a bare
 *  datetime-local value. */
function parseScheduleDate(raw: FormDataEntryValue | null | undefined, endOfDay: boolean): string | null {
  const day = String(raw ?? '').trim()
  if (!day) return null
  const parsed = new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  if (Number.isNaN(parsed.getTime())) throw new ValidationError('Enter a valid date.')
  return parsed.toISOString()
}

function assertPublishBeforeExpiry(publish_at: string | null, expires_at: string | null): void {
  if (publish_at && expires_at && Date.parse(publish_at) >= Date.parse(expires_at)) {
    throw new ValidationError('The expiry date must be after the publish date.')
  }
}

export function validateCreateAnnouncementInput(input: CreateAnnouncementActionInput): CreateAnnouncementInput {
  const rawClassId = String(input.class_id ?? '')
  const parsed = createAnnouncementSchema.safeParse({
    class_id: rawClassId === '' ? null : rawClassId,
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement data: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }

  const publish_at = parseScheduleDate(input.publish_at, false)
  const expires_at = parseScheduleDate(input.expires_at, true)
  assertPublishBeforeExpiry(publish_at, expires_at)

  return {
    class_id: parsed.data.class_id ?? null,
    title: parsed.data.title,
    message: parsed.data.message,
    attachments: parseAttachments(input.attachments),
    publish_at,
    expires_at,
  }
}

export function validateEditAnnouncementInput(input: EditAnnouncementActionInput): {
  id: string
  patch: AnnouncementEditPatch
} {
  const parsed = editAnnouncementInputSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    message: String(input.message ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError(`Invalid announcement update: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  }

  const publish_at = parseScheduleDate(input.publish_at, false)
  const expires_at = parseScheduleDate(input.expires_at, true)
  assertPublishBeforeExpiry(publish_at, expires_at)

  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      message: parsed.data.message,
      attachments: parseAttachments(input.attachments),
      publish_at,
      expires_at,
    },
  }
}
