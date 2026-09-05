import 'server-only'
import { pingDatabase } from '@/lib/data/org-settings'

/**
 * Liveness probing for the public /api/health target and the secret-gated
 * /api/cron/keepalive. Exists so the route handlers stay transport-only and do not
 * reach into the data layer themselves - the layering is app -> services -> data.
 *
 * Deliberately returns a boolean and never throws: a liveness probe must answer even
 * when the database is the thing that is down.
 */
export async function checkDatabaseLiveness(): Promise<boolean> {
  return pingDatabase().catch(() => false)
}
