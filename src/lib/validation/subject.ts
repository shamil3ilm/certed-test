import { z } from 'zod'

/**
 * A subject name: trimmed, 1-60 chars. Case-insensitive uniqueness is enforced in
 * the DB (subjects_name_lower_key) and the service reuses an existing name rather
 * than creating a duplicate, so the inline "+ Add" on the picker can't fork
 * "Maths" vs "maths".
 */
export const subjectNameSchema = z.string().trim().min(1, 'Enter a subject name').max(60)

export const createSubjectSchema = z.object({ name: subjectNameSchema })
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>

export const subjectIdSchema = z.string().uuid()
