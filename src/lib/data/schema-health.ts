import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMock } from '@/lib/mock/env'

/** Of the given public tables, those with row-level security DISABLED - via the
 *  rls_disabled_tables SECURITY DEFINER function (migration 0069). Empty when every
 *  one has RLS on. Service role: the function is granted to service_role only. */
export async function selectRlsDisabledTables(tables: string[]): Promise<string[]> {
  // Mock mode has no real database or RLS - nothing to assert.
  if (isMock() || tables.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rls_disabled_tables', { p_tables: tables })
  if (error) throw new Error(`schemaHealth.rlsDisabled: ${error.message}`)
  return (data as string[]) ?? []
}
