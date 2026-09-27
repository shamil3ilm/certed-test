import 'server-only'
import { selectActiveProfilesByRoles } from '@/lib/data/profiles'

/**
 * The active admin tier - the people who manage accounts, and so the audience for anything that
 * happens TO an account rather than inside a classroom.
 *
 * Lives outside services/users on purpose: consents and users both notify this audience, and
 * users already imports consents, so a helper inside users would close that loop into a cycle.
 *
 * `exclude` drops one id, for the common case of not telling someone about their own account.
 */
export async function accountManagerIds(exclude?: string): Promise<string[]> {
  const managers = await selectActiveProfilesByRoles(['admin', 'sub_admin'])
  return managers.map((m) => m.id).filter((id) => id !== exclude)
}
