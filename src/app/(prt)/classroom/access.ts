import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import type { Profile } from '@/lib/auth/profile'
import { getClass, type ClassRow } from '@/lib/services/classes'
import { canAccessClass } from '@/lib/permission'

/**
 * Page guard for a single class workspace: enforces the viewClasses capability +
 * active status (admin/tutor/student - the class participants), loads the class,
 * and 404s if it doesn't exist or the caller isn't a member. The coarse gate is
 * the capability; per-class membership is `canAccessClass`. Returns the caller
 * profile and the class.
 */
export async function requireClassAccess(classId: string): Promise<{ me: Profile; course: ClassRow }> {
  const me = await requireCapability('viewClasses')
  const course = await getClass(classId)
  if (!course) notFound()
  if (!(await canAccessClass(me, classId))) notFound()
  return { me, course }
}
