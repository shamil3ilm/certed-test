import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { teachesClass } from '@/lib/auth/class-scope'

/**
 * App-layer mirror of the Postgres `teaches_class` RLS scope function (see
 * classScope.ts) -- a distinct mechanism from canManageClass's admin-client
 * membership lookup. Used by calendar events / timetable slots, which write
 * via the RLS-scoped client: calling the same SECURITY DEFINER function via
 * RPC keeps the explicit app-side guard and the row-level policy in
 * agreement by construction. Admin may write anything; a tutor only a
 * class they teach; a global (null class_id) write is admin-only.
 */
export async function canWriteClass(profile: Profile, classId: string | null): Promise<boolean> {
  const { isAdmin, isTutor } = await loadPersonaFlags(profile.id)
  if (isAdmin) return true
  if (!isTutor) return false
  if (classId == null) return false
  return teachesClass(classId)
}
