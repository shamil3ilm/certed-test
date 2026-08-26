import { createBrowserClient } from '@supabase/ssr'
import { parseCookieHeader, serializeHardenedCookie } from './browser-cookie-adapter'

type PublicSupabaseEnvName = 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'

// The value MUST be passed in from a STATIC `process.env.NEXT_PUBLIC_*` reference at
// the call site. Next.js only inlines `process.env.NEXT_PUBLIC_FOO` into the client
// bundle when the property is a literal; a dynamic `process.env[name]` is never
// inlined and reads `undefined` in the browser - which broke sign-in even when the
// variables were correctly set in the deployment environment.
function requiredPublicEnv(name: PublicSupabaseEnvName, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required public environment variable ${name}.`)
  }
  return value
}

export function getPublicSupabaseEnvError(): string | null {
  const missing: PublicSupabaseEnvName[] = []

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }

  if (missing.length === 0) return null
  return `Missing required public environment variable${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`
}

export function createClient() {
  // Sign-in runs client-side, so the BROWSER writes the session cookie first. Passing
  // `cookieOptions: { maxAge }` does NOT work: @supabase/ssr rebuilds the options as
  // `{ ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }`,
  // hard-overriding maxAge back to its 400-day default AFTER the spread (secure survives,
  // maxAge is silently dropped). So we own the write via getAll/setAll and re-apply the
  // SAME hardening the server paths use (hardenCookieOptions): Secure in production and a
  // 30-day inactivity ceiling. This mirrors the library's own document.cookie adapter,
  // minus the discarded maxAge, so encoding stays identical to the server-written cookie.
  return createBrowserClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return []
          return parseCookieHeader(document.cookie)
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return
          for (const { name, value, options } of cookiesToSet) {
            document.cookie = serializeHardenedCookie(name, value, options ?? {})
          }
        },
      },
    },
  )
}
