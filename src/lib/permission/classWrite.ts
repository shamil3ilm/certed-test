import type { Profile } from '@/lib/auth/profile'
import { teachesClass } from '@/lib/auth/classScope'

/**
 * App-layer mirror of the Postgres `teaches_class` RLS scope function (see
 * classScope.ts) — a DISTINCT mechanism from canManageClass's admin-client
 * membership lookup. Used by calendar events / timetable slots, which write
 * via the RLS-scoped client: calling the SAME SECURITY DEFINER function via
 * RPC keeps the explicit app-side guard and the row-level policy in
 * agreement by construction. Admin may write anything; a teacher only a
 * class they teach; a global (null class_id) write is admin-only.
 */
export async function canWriteClass(profile: Profile, classId: string | null): Promise<boolean> {
  if (profile.role === 'admin') return true
  if (profile.role !== 'teacher') return false
  if (classId == null) return false
  return teachesClass(classId)
}
