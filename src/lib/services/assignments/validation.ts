import { ValidationError } from '@/lib/errors'
import { createAssignmentSchema } from '@/lib/validation/assignment'
import { linkUrl } from '@/lib/validation/url'
import { titleField } from '@/lib/validation/fields'
import type { AssignmentType } from '@/lib/data/assignments'
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
  type?: AssignmentType
  expects_submission?: boolean
  ends_at?: string | null
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
  type?: unknown
  expects_submission?: unknown
  ends_at?: unknown
}

/** In-person assessments (exam/quiz/test) default to no online submission; other
 *  classwork defaults to online submission. */
export function defaultExpectsSubmission(type: AssignmentType): boolean {
  return type === 'assignment' || type === 'project'
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
  type: z.enum(['assignment', 'exam', 'quiz', 'test', 'project']).optional(),
  ends_at: z.string().datetime().optional(),
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
  type?: FormDataEntryValue | null
  expects_submission?: FormDataEntryValue | null
  ends_at?: FormDataEntryValue | null
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
  const type = parsed.data.type ?? 'assignment'
  const expectsSubmission = parsed.data.expects_submission ?? defaultExpectsSubmission(type)
  const dueIso = new Date(parsed.data.due_date).toISOString()
  let endsAt: string | null = null
  if (parsed.data.ends_at) {
    endsAt = new Date(parsed.data.ends_at).toISOString()
    // Both are UTC ...Z ISO strings, so lexical compare is chronological.
    if (endsAt <= dueIso) throw new ValidationError('End time must be after the start/due time')
  }
  return {
    class_id: parsed.data.class_id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    due_date: dueIso,
    attachment_drive_link: parsed.data.attachment_drive_link ?? null,
    topic: parsed.data.topic ?? null,
    max_marks: parsed.data.max_marks ?? null,
    // In-person work has no online submission, so a submission deadline can't apply.
    enforce_deadline: expectsSubmission ? (parsed.data.enforce_deadline ?? false) : false,
    type,
    expects_submission: expectsSubmission,
    ends_at: endsAt,
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
    type?: AssignmentType
    expects_submission?: boolean
    ends_at?: string | null
  }
} {
  const hasTypeFields = input.type != null && String(input.type) !== ''
  const parsed = editAssignmentActionSchema.safeParse({
    id: String(input.id ?? ''),
    title: String(input.title ?? ''),
    description: String(input.description ?? ''),
    due_date: String(input.due_date ?? ''),
    attachment_drive_link: String(input.attachment_drive_link ?? ''),
    topic: String(input.topic ?? ''),
    type: hasTypeFields ? String(input.type) : undefined,
    ends_at: input.ends_at != null && String(input.ends_at) !== '' ? String(input.ends_at) : undefined,
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
  const dueIso = new Date(parsed.data.due_date).toISOString()
  const enforceDeadline = parseCheckbox(input.enforce_deadline)

  // Classwork-type fields are only patched when the (updated) form sends them, so an
  // older client that omits them leaves type/submission/window untouched rather than
  // silently reverting an exam to a plain assignment.
  const typePatch: { type?: AssignmentType; expects_submission?: boolean; ends_at?: string | null } = {}
  if (hasTypeFields) {
    const type = parsed.data.type ?? 'assignment'
    const expectsSubmission = parseCheckbox(input.expects_submission)
    let endsAt: string | null = null
    if (parsed.data.ends_at) {
      endsAt = new Date(parsed.data.ends_at).toISOString()
      if (endsAt <= dueIso) throw new ValidationError('End time must be after the start/due time')
    }
    typePatch.type = type
    typePatch.expects_submission = expectsSubmission
    typePatch.ends_at = endsAt
  }

  return {
    id: parsed.data.id,
    patch: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      due_date: dueIso,
      attachment_drive_link: brief || null,
      topic: parsed.data.topic || null,
      max_marks,
      // In-person work has no online submission, so a deadline can't apply.
      enforce_deadline: hasTypeFields && typePatch.expects_submission === false ? false : enforceDeadline,
      ...typePatch,
    },
  }
}
