import { createBrowserClient } from '@supabase/ssr'

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
  return createBrowserClient(
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requiredPublicEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  )
}
