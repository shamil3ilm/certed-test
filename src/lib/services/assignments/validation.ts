import { ValidationError } from '@/lib/errors'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { linkUrl } from '@/lib/validation/url'
import { titleField } from '@/lib/validation/fields'
import { z } from 'zod'

/** Raw API/form values -> trusted inputs. Pure: no IO, no authorization. */

export type CreateAssignmentInput = {
  class_id: string
  title: string
  description: string | null
  due_date: string
  attachment_drive_link?: string | null
  topic?: string | null
  max_marks?: number | null
  enforce_deadline?: boolean
}

export type CreateAssignmentApiInput = {
  class_id?: unknown
  title?: unknown
  description?: unknown
  due_date?: unknown
  attachment_drive_link?: unknown
  topic?: unknown
  max_marks?: unknown
  enforce_deadline?: unknown
}

const assignmentIdSchema = z.string().uuid()
const assignmentStatusSchema = z.enum(['active', 'archived'])
const editAssignmentActionSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  description: z.string().trim().max(5000),
  due_date: z.string().datetime(),
  attachment_drive_link: z.string().trim(),
  topic: z.string().trim().max(60),
})

/** A checkbox form value ("on"/"true"/absent) -> boolean. */
function parseCheckbox(value: FormDataEntryValue | null | undefined): boolean {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  return v === 'on' || v === 'true' || v === '1'
}

export type ArchiveAssignmentActionInput = {
  id?: FormDataEntryValue | null
  status?: FormDataEntryValue | null
}

export type EditAssignmentActionInput = {
  id?: FormDataEntryValue | null
  title?: FormDataEntryValue | null
  description?: FormDataEntryValue | null
  due_date?: FormDataEntryValue | null
  attachment_drive_link?: FormDataEntryValue | null
  topic?: FormDataEntryValue | null
  max_marks?: FormDataEntryValue | null
  enforce_deadline?: FormDataEntryValue | null
}

export function validateArchiveAssignmentInput(input: ArchiveAssignmentActionInput): {
  id: string
  status: 'active' | 'archived'
} {
  const id = assignmentIdSchema.safeParse(String(input.id ?? ''))
  const status = assignmentStatusSchema.safeParse(
    String(input.status ?? 'archived') === 'active' ? 'active' : 'archived',
  )
  if (!id.success || !status.success) {
    throw new ValidationError('Invalid assignment status update')
  }
  return { id: id.data, status: status.data }
}

export function validateCreateAssignmentInput(input: CreateAssignmentApiInput): CreateAssignmentInput {
  const parsed = createAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid assignment data')
  }
  return {
    class_id: parsed.data.class_id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    due_date: new Date(parsed.data.due_date).toISOString(),
    attachment_drive_link: parsed.data.attachment_drive_link ?? null,
    topic: parsed.data.topic ?? null,
    max_marks: parsed.data.max_marks ?? null,
    enforce_deadline: parsed.data.enforce_deadline ?? false,
  }
}

export function validateEditAssignmentInput(input: EditAssignmentActionInput): {
  id: string
  patch: {
    title: string
    description: string | null
    due_date: string
    attachment_drive_link: string | null
    topic: string | null
    max_marks: number | null
    enforce_deadline: boolean
  }
} {
  const parsed = editAssignmentActionSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    description: String(input.description ?? ''),
    due_date: String(input.due_date ?? ''),
    attachment_drive_link: String(input.attachment_drive_link ?? ''),
    topic: String(input.topic ?? ''),
  })
  if (!parsed.success) {
    throw new ValidationError('Invalid assignment update data')
  }
  const brief = parsed.data.attachment_drive_link
  if (brief && !linkUrl.safeParse(brief).success) {
    throw new ValidationError('Invalid assignment attachment link')
  }
  // max_marks is REQUIRED so every assignment grades out of a total. Blank or a
  // non-positive value is rejected; it must fit the numeric(6,2) column.
  const rawMax = String(input.max_marks ?? '').trim()
  if (!rawMax) throw new ValidationError('Max marks is required')
  const max_marks = Number(rawMax)
  if (Number.isNaN(max_marks) || max_marks <= 0 || max_marks > 9999.99) {
    throw new ValidationError('Max marks must be a positive number')
  }
  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      due_date: new Date(parsed.data.due_date).toISOString(),
      attachment_drive_link: brief || null,
      topic: parsed.data.topic || null,
      max_marks,
      enforce_deadline: parseCheckbox(input.enforce_deadline),
    },
  }
}
