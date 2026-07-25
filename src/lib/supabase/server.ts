import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isMock } from '@/lib/mock/env'
import { supabaseAnonEnv } from '@/lib/env'
import { createMockServerClient } from '@/lib/mock/client'

export async function createClient() {
  if (isMock()) return createMockServerClient()
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseAnonEnv()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Called from a Server Component -> the cookie store is read-only.
        // Middleware (updateSession) refreshes the session cookie instead.
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          /* no-op in read-only contexts */
        }
      },
    },
  })
}
