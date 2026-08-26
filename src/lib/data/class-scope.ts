import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * The Postgres scope helpers that RLS itself uses (`teaches_class` /
 * `is_enrolled`), called by RPC through the request's own client.
 *
 * Calling the same SECURITY DEFINER functions is the whole point: the app-side
 * write guards and the row-level policies then agree by construction rather
 * than by two implementations being kept in step by hand. Answers for the
 * current signed-in user, which is why it takes no actor argument.
 */
export async function callTeachesClass(classId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teaches_class', { p_class_id: classId })
  if (error) throw new Error(`teachesClass: ${error.message}`)
  return Boolean(data)
}

/**
 * The tutor-only WRITE scope (`teaches_class_write`, migration 0079) that the
 * class-scoped write policies gate on - the narrower sibling of `teaches_class`
 * (which still grants a mentor oversight READ). Mirroring THIS function is what keeps
 * the app-side write guard and the row-level write policy in agreement, so a write that
 * passes the app guard is never rejected by RLS (a mismatch surfaces as a raw 500).
 */
export async function callTeachesClassWrite(classId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teaches_class_write', { p_class_id: classId })
  if (error) throw new Error(`teachesClassWrite: ${error.message}`)
  return Boolean(data)
}
