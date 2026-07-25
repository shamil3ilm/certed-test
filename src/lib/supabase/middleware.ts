import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { supabaseAnonEnv } from '@/lib/env'
import { getMockUidFromRequest } from '@/lib/mock/session'

/**
 * Refreshes the Supabase auth session on every app-host request and returns the
 * current user (or null). Cookies are written onto the passed-in response so the
 * refreshed session propagates to the browser.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  if (isMock()) {
    const uid = getMockUidFromRequest(request)
    return (uid ? { id: uid } : null) as unknown as Awaited<ReturnType<typeof getUserReal>>
  }
  return getUserReal(request, response)
}

async function getUserReal(request: NextRequest, response: NextResponse) {
  const { url, anonKey } = supabaseAnonEnv()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
