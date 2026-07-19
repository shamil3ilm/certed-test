import { codeForServiceError, type ErrorCode } from '@/lib/api/error-codes'
import { ServiceError } from '@/lib/errors'
import { GENERIC_ERROR_MESSAGE } from '@/lib/api/messages'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ErrorCode }
export type ActionStatusResult = { ok: true } | { ok: false; error: string; code?: ErrorCode }

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function actionDone(): ActionStatusResult {
  return { ok: true }
}

export function actionFail(error: string, code?: ErrorCode): ActionResult<never> {
  return { ok: false, error, code }
}

/**
 * Maps an error thrown by a service call to a Server Action result. A typed
 * `ServiceError` surfaces its own message (safe by construction - services
 * never put raw DB/internal detail in a ServiceError message); anything else
 * becomes a generic message - never forward an unknown error's message to
 * the client.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof ServiceError) return actionFail(error.message, codeForServiceError(error))
  return actionFail(GENERIC_ERROR_MESSAGE)
}
