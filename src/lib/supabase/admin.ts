import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isMock } from '@/lib/mock/env'
import { createMockAdminClient } from '@/lib/mock/client'

/**
 * Service-role client. Bypasses RLS - use ONLY in server code for admin
 * operations (adding users, revoking access, finance issuance). Never import
 * this into a client component.
 */
export function createAdminClient() {
  if (isMock()) return createMockAdminClient()
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
