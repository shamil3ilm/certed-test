import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * The Postgres scope helpers that RLS itself uses (`teaches_class` /
 * `is_enrolled`, migration 0002), called by RPC through the request's own
 * client.
 *
 * Calling the SAME SECURITY DEFINER functions is the whole point: the app-side
 * write guards and the row-level policies then agree by construction rather
 * than by two implementations being kept in step by hand. Answers for the
 * CURRENT signed-in user, which is why it takes no actor argument.
 */
export async function callTeachesClass(classId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teaches_class', { p_class_id: classId })
  if (error) throw new Error(`teachesClass: ${error.message}`)
  return Boolean(data)
}
