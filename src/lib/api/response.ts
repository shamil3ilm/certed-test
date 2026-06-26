import { NextResponse } from 'next/server'

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Success envelope: `{ success: true, data }`. */
export function ok<T>(data: T) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>)
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
