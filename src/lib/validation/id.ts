import { z } from 'zod'
import { ValidationError } from '@/lib/errors'

const uuidSchema = z.string().uuid()

/**
 * Validate a single UUID form field, throwing ValidationError(message) when the
 * value is missing or malformed. Trims first - a UUID never carries meaningful
 * surrounding whitespace - so a padded form value still validates. Callers pass
 * their own message so the failure reads in their domain's terms.
 */
export function validateUuidField(raw: FormDataEntryValue | null | undefined, message: string): string {
  const parsed = uuidSchema.safeParse(String(raw ?? '').trim())
  if (!parsed.success) throw new ValidationError(message)
  return parsed.data
}

/** Non-throwing UUID check, for a boundary that returns its own error shape (e.g. a
 *  JSON API route) rather than throwing a ValidationError. */
export function isUuid(raw: string): boolean {
  return uuidSchema.safeParse(raw.trim()).success
}
