import { z } from 'zod'

/** A required display title: trimmed, 1-200 characters. Shared by resources,
 *  materials, assignments, announcements, meet links and reminders so the single
 *  length cap lives in one place and the schemas can't drift. */
export const titleField = z.string().trim().min(1).max(200)
