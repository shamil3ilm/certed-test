import { z } from 'zod'
import { ValidationError } from '@/lib/errors'

/**
 * Parse `input` with a Zod schema, throwing a typed ValidationError on failure
 * instead of returning a discriminated result. Consolidates the
 * `safeParse -> throw new ValidationError(issues[0]?.message ?? 'invalid')` idiom
 * the API-input validators repeat.
 *
 * Pass `message` to force a fixed user-facing message (e.g. id validators that
 * shouldn't surface a raw zod issue); omit it to use the schema's first issue.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown, message?: string): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(message ?? parsed.error.issues[0]?.message ?? 'invalid')
  }
  return parsed.data
}
