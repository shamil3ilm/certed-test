import type { NextRequest } from 'next/server'

/** Cookie that names the signed-in mock user (its profiles.auth_user_id). */
export const MOCK_COOKIE = 'mock_uid'

/** Reads the current mock user id from the server cookie store (RSC / route handlers). */
export async function getMockUidFromStore(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const store = await cookies()
  return store.get(MOCK_COOKIE)?.value ?? null
}

/** Reads the current mock user id from a middleware NextRequest. */
export function getMockUidFromRequest(request: NextRequest): string | null {
  return request.cookies.get(MOCK_COOKIE)?.value ?? null
}
