import { getProfile, type Profile } from '@/lib/auth/profile'
import { teachesClass } from '@/lib/auth/classScope'
import { fail } from './response'

type WriteAuth = { ok: true; profile: Profile } | { ok: false; res: ReturnType<typeof fail> }

/**
 * Authorize a write to a class-scoped resource (calendar event / timetable slot):
 * an admin may write anything; a teacher only a class they teach; a global
 * (null class_id) write is admin-only. Returns the profile, or a ready 401/403.
 */
export async function authorizeClassWrite(classId: string | null): Promise<WriteAuth> {
  const profile = await getProfile()
  if (!profile || profile.status !== 'active') return { ok: false, res: fail('no-access', 401) }
  if (profile.role === 'admin') return { ok: true, profile }
  if (profile.role !== 'teacher') return { ok: false, res: fail('forbidden', 403) }
  if (classId == null) return { ok: false, res: fail('forbidden', 403) }
  if (!(await teachesClass(classId))) return { ok: false, res: fail('forbidden', 403) }
  return { ok: true, profile }
}
