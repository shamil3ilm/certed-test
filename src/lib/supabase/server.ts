import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isMock } from '@/lib/mock/env'
import { createMockServerClient } from '@/lib/mock/client'

export async function createClient() {
  if (isMock()) return createMockServerClient()
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Called from a Server Component → the cookie store is read-only.
          // Middleware (updateSession) refreshes the session cookie instead.
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            /* no-op in read-only contexts */
          }
        },
      },
    },
  )
}
