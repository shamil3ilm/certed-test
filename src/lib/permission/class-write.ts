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
 * teaches_class. This guard is authoritative on its own; RLS is the second layer.
 * The two AGREE only on a database migrated through 0043_mentor_class_authority,
 * which widens teaches_class to include a mentor of an enrolled student. The
 * rebuild snapshot (supabase/rebuild/0000_full_rebuild.sql) predates 0043, so an
 * environment provisioned from it has the tutor-only teaches_class and would
 * RLS-DENY a mentor's write here - stricter than this guard (fail-safe), not a
 * hole, but a real break: regenerate the snapshot (npm run db:rebuild-snapshot)
 * so RLS matches before using it. (Mock mode has no RLS, so this guard is
 * sufficient there.)
 */
export async function canWriteClass(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin, isTutor, hasMentorAuthority } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (classId == null) return false
  if (isTutor && (await teachesClass(classId))) return true
  if (hasMentorAuthority && (await mentorAuthorityClassIds(profile.id)).has(classId)) return true
  return false
}
