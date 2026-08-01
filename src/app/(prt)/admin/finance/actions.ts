'use server'

import { requireCapability } from '@/lib/auth/require-role'
import { actionOk, actionFail, toActionError, type ActionResult } from '@/lib/api/action-error'
import { rateLimit } from '@/lib/security/rate-limit'
import { searchFinanceStudents, type FinancePageParty } from '@/lib/services/finance/admin-finance'

/**
 * Typeahead source for the receipt IssueForm's student picker.
 *
 * requireCapability('viewFinance') establishes the actor (and redirects a
 * non-viewer away), matching the finance page's own read gate; the authoritative
 * check is inside searchFinanceStudents, which requires manageAdminTier - the
 * hard-rule capability the issue API enforces - so an override-granted viewer
 * gets an actionFail here rather than the student roster.
 */
export async function searchFinanceStudentsAction(query: string): Promise<ActionResult<FinancePageParty[]>> {
  const me = await requireCapability('viewFinance')
  // A server action is directly POST-callable and isn't covered by the client
  // debounce, so throttle per user like the sibling finance handlers do.
  if (!rateLimit(`finance-party-search:${me.id}`, { limit: 30, windowMs: 60_000 }).ok) {
    return actionFail('You are searching too quickly. Please wait a moment.')
  }
  try {
    return actionOk(await searchFinanceStudents(me.id, query))
  } catch (error) {
    return toActionError(error)
  }
}
