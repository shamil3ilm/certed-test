import { createClient } from '@/lib/supabase/server'

/**
 * App-layer mirror of the Postgres scope helpers used by RLS (`teaches_class` /
 * `is_enrolled` from migration 0002). Calling the SAME SECURITY DEFINER functions via RPC
 * keeps a single source of truth: the explicit write guards in the route handlers and the
 * row-level policies agree by construction. Returns whether the *current* signed-in user
 * teaches / is enrolled in the given course.
 */
export async function teachesClass(classId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teaches_class', { p_class_id: classId })
  if (error) throw new Error(`teachesClass: ${error.message}`)
  return Boolean(data)
}
