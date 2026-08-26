import { callTeachesClass, callTeachesClassWrite } from '@/lib/data/class-scope'

/**
 * App-layer mirror of the Postgres scope helpers used by RLS (`teaches_class` /
 * `is_enrolled`). Calling the same SECURITY DEFINER functions via RPC keeps a
 * single source of truth: the explicit write guards in the route handlers and
 * the row-level policies agree by construction. Returns whether the current
 * signed-in user teaches / is enrolled in the given course.
 */
export async function teachesClass(classId: string): Promise<boolean> {
  return callTeachesClass(classId)
}

/**
 * The tutor-only WRITE scope (`teaches_class_write`) - excludes the mentor oversight
 * branch that `teachesClass` keeps. This is the function the class-scoped write policies
 * gate on since 0079, so canWriteClass mirrors THIS, not the read scope.
 */
export async function teachesClassWrite(classId: string): Promise<boolean> {
  return callTeachesClassWrite(classId)
}
