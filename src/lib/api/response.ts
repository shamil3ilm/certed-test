import { NextResponse } from 'next/server'
import { ServiceError } from '@/lib/errors'

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Success envelope: `{ success: true, data }`. */
export function ok<T>(data: T) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>)
}

/** Success envelope with HTTP 201 Created. */
export function created<T>(data: T) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>, { status: 201 })
}

/** Error envelope: `{ success: false, error }` with an HTTP status (default 400). */
export function fail(error: string, status = 400) {
  return NextResponse.json(
    { success: false, error } satisfies ApiResponse<never>,
    { status },
  )
}

/** Maps a coded auth error from `requireRoleApi` to a 401/403 JSON response. */
export function authFail(error: unknown) {
  const msg = error instanceof Error ? error.message : 'error'
  const status = msg === 'forbidden' || msg === 'revoked' ? 403 : 401
  return fail(msg, status)
}

const AUTH_CODES = new Set(['no-access', 'revoked', 'forbidden'])

/**
 * Maps an error thrown by a service call to a JSON response. A typed
 * `ServiceError` (PermissionError/NotFoundError/ValidationError) maps to its
 * own status + message; the existing requireRole/requireRoleApi coded errors
 * fall through to `authFail`; anything else (e.g. a raw DB error) becomes a
 * generic 500 — never forward an unknown error's message to the client, it
 * may contain internal schema/constraint detail.
 */
export function apiError(error: unknown) {
  if (error instanceof ServiceError) return fail(error.message, error.status)
  if (error instanceof Error && AUTH_CODES.has(error.message)) return authFail(error)
  return fail('Something went wrong. Please try again.', 500)
}
