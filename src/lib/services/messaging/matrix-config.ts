import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { updateMessagingMatrix } from '@/lib/data/org-settings'
import { requireAdminPersona } from '@/lib/permission/personas'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { parseMessagingMatrix, serializeMessagingMatrix } from '@/lib/messaging/matrix'

/**
 * Read/write the admin-configured messaging matrix. Reads normalise through the
 * pure model (unknown/false pairs dropped); the write is capability-gated and
 * audited. The matrix widens messaging ADDITIVELY over the fixed direct-contact
 * default - see src/lib/messaging/recipient-policy.
 */

/** The current matrix as a canonical `{ "a|b": true }` record, for the admin grid. */
export async function getMessagingMatrixRecord(): Promise<Record<string, boolean>> {
  return serializeMessagingMatrix(parseMessagingMatrix((await getOrgSettings()).messaging_matrix))
}

/** Persist the matrix from a list of enabled canonical pair keys. ADMIN persona only:
 *  this writes org_settings, whose DB policy (org_admin_write, is_active_admin) allows
 *  the admin persona alone - a `manageUsers` gate would let a sub_admin write it via the
 *  service-role path, contradicting the DB (the same drift fixed for the bank fields).
 *  serializeMessagingMatrix re-canonicalises and drops anything unrecognised, so a
 *  crafted payload can never enable a pair outside the known persona set. */
export async function saveMessagingMatrix(actor: Profile, enabledKeys: string[]): Promise<void> {
  await requireAdminPersona(actor)
  await updateMessagingMatrix(serializeMessagingMatrix(enabledKeys))
  await auditPrivilegedAction(actor, 'messaging.policy_update', 'org_settings', null)
}
