import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { mentorAuthorityClassIds } from '@/lib/permission/class'
import { teachesClass } from '@/lib/auth/class-scope'

/**
 * App-layer mirror of the Postgres `teaches_class` RLS scope function (see
 * classScope.ts) -- a distinct mechanism from canManageClass's admin-client
 * membership lookup. Used by calendar events / timetable slots, which write
 * via the RLS-scoped client: calling the same SECURITY DEFINER function via
 * RPC keeps the explicit app-side guard and the row-level policy in
 * agreement by construction. Admin may write anything; a tutor only a
 * class they teach; a mentor only a class one of their mentees is in; a
 * global (null class_id) write is admin-only.
 *
 * RLS NOTE: the row-level policies across class-scoped tables gate on
 * teaches_class. Migration 0043_mentor_class_authority widens teaches_class to
 * include a mentor of an enrolled student, so the RLS layer agrees with this app
 * guard in production. (Mock mode has no RLS, so this guard is sufficient there.)
 */
export async function canWriteClass(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin, isTutor, hasMentorAuthority } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (classId == null) return false
  if (isTutor && (await teachesClass(classId))) return true
  if (hasMentorAuthority && (await mentorAuthorityClassIds(profile.id)).has(classId)) return true
  return false
}
