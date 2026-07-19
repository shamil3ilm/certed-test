import { NextResponse } from 'next/server'
import {
  ERROR_CODES,
  codeForAuthMessage,
  codeForServiceError,
  type ErrorCode,
} from '@/lib/api/error-codes'
import { ServiceError } from '@/lib/errors'
import {
  GENERIC_ERROR_MESSAGE,
  INVALID_INPUT_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
} from '@/lib/api/messages'

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ErrorCode }

/** Success envelope: `{ success: true, data }`. */
export function ok<T>(data: T) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>)
}

/** Success envelope with HTTP 201 Created. */
export function created<T>(data: T) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>, { status: 201 })
}

/** Error envelope: `{ success: false, error }` with an HTTP status (default 400). */
export function fail(error: string, status = 400, code?: ErrorCode) {
  return NextResponse.json(
    { success: false, error, code } satisfies ApiResponse<never>,
    { status },
  )
}

export function invalidJson(message = INVALID_REQUEST_MESSAGE) {
  return fail(message, 400, ERROR_CODES.invalidRequest)
}

export function invalidInput(message = INVALID_INPUT_MESSAGE, status = 422) {
  return fail(message, status, ERROR_CODES.invalidInput)
}

export function tooManyRequests(message = TOO_MANY_REQUESTS_MESSAGE, retryAfterSec?: number) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: ERROR_CODES.rateLimited,
    } satisfies ApiResponse<never>,
    {
      status: 429,
      headers: retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : undefined,
    },
  )
}

export function serverError(message = GENERIC_ERROR_MESSAGE) {
  return fail(message, 500, ERROR_CODES.internalError)
}

export function textFail(message: string, status = 400, headers?: HeadersInit) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    },
  })
}

export function forbiddenText(message = 'Forbidden') {
  return textFail(message, 403)
}

export function notFoundText(message = 'Not found') {
  return textFail(message, 404)
}

export function tooManyRequestsText(message = TOO_MANY_REQUESTS_MESSAGE, retryAfterSec?: number) {
  return textFail(message, 429, retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : undefined)
}

/** Maps a coded auth error from `requireRoleApi` to a 401/403 JSON response. */
export function authFail(error: unknown) {
  const msg = error instanceof Error ? error.message : 'error'
  const status = msg === 'forbidden' || msg === 'revoked' ? 403 : 401
  return fail(msg, status, codeForAuthMessage(msg))
}

const AUTH_CODES = new Set(['no-access', 'revoked', 'forbidden'])

/**
 * Maps an error thrown by a service call to a JSON response. A typed
 * `ServiceError` (PermissionError/NotFoundError/ValidationError) maps to its
 * own status + message; the existing requireRole/requireRoleApi coded errors
 * fall through to `authFail`; anything else (e.g. a raw DB error) becomes a
 * generic 500 - never forward an unknown error's message to the client, it
 * may contain internal schema/constraint detail.
 */
export function apiError(error: unknown) {
  if (error instanceof ServiceError) {
    return fail(error.message, error.status, codeForServiceError(error))
  }
  if (error instanceof Error && AUTH_CODES.has(error.message)) return authFail(error)
  return serverError()
}
