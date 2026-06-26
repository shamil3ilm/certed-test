import { createClient } from '@/lib/supabase/server'

/**
 * App-layer mirror of the Postgres scope helpers used by RLS (`teaches_course` /
 * `is_enrolled` from migration 0002). Calling the SAME SECURITY DEFINER functions via RPC
 * keeps a single source of truth: the explicit write guards in the route handlers and the
 * row-level policies agree by construction. Returns whether the *current* signed-in user
 * teaches / is enrolled in the given course.
 */
export async function teachesCourse(courseId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('teaches_course', { p_course_id: courseId })
  if (error) throw new Error(`teachesCourse: ${error.message}`)
  return Boolean(data)
}

export async function isEnrolled(courseId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_enrolled', { p_course_id: courseId })
  if (error) throw new Error(`isEnrolled: ${error.message}`)
  return Boolean(data)
}
