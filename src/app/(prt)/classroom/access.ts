import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/require-role'
import type { Profile } from '@/lib/auth/profile'
import { getClass, type ClassRow } from '@/lib/services/classes'
import { canAccessClass } from '@/lib/permission'

/**
 * Page guard for a single class workspace: enforces role + status (via
 * requireRole), loads the class, and 404s if it doesn't exist or the caller
 * isn't a member. Returns the caller profile and the class.
 */
export async function requireClassAccess(
  classId: string,
  roles: Profile['role'][] = ['admin', 'tutor', 'student'],
): Promise<{ me: Profile; course: ClassRow }> {
  const me = await requireRole(roles)
  const course = await getClass(classId)
  if (!course) notFound()
  if (!(await canAccessClass(me, classId))) notFound()
  return { me, course }
}
