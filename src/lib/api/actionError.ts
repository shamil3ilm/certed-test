import { ServiceError } from '@/lib/errors'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Maps an error thrown by a service call to a Server Action result. A typed
 * `ServiceError` surfaces its own message (safe by construction — services
 * never put raw DB/internal detail in a ServiceError message); anything else
 * becomes a generic message — never forward an unknown error's message to
 * the client.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof ServiceError) return { ok: false, error: error.message }
  return { ok: false, error: 'Something went wrong. Please try again.' }
}
