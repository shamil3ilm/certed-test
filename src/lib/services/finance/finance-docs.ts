import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'
import { toRange } from '@/lib/pagination'
import {
  callFinanceTotalsBase,
  callIssueDoc,
  selectAllDocs,
  selectDocById,
  selectDocLines,
  selectDocPage,
  selectDocPageForParty,
  selectPartyDocTotals,
  selectRecentDocs,
  updateDocVoided,
  type FinanceDoc,
  type FinanceKind,
  type FinanceLine,
  type FinanceBaseTotal,
  type IssueFinanceDocInput,
} from '@/lib/data/finance-docs'

/**
 * Receipts and pay slips. The finance model is immutable: a document is never
 * edited, and a correction is a void plus a reissue.
 *
 * Table access lives in src/lib/data/finance-docs, which also owns the
 * receipt/payslip shape difference so nothing here touches a raw column name.
 *
 * Issuing and voiding enforce their own permission check on manageAdminTier,
 * the hard-rule admin-tier marker that is never override-grantable. Route-level
 * guards remain the transport gate; the service keeps the domain rule with the
 * write itself.
 */

export const FINANCE_DENIED = 'You are not allowed to manage finance documents.'

export type { FinanceDoc, FinanceKind, FinanceLine, FinanceBaseTotal, IssueFinanceDocInput }
type PaginatedFinanceDocs = { items: FinanceDoc[]; total: number }

const financeDocIdSchema = z.string().uuid()

export function validateFinanceDocId(input: unknown): string {
  const parsed = financeDocIdSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid finance document id')
  }
  return parsed.data
}

/** ONE page of a caller's own documents (RLS-scoped), newest first, with the exact total. */
export async function listMyDocsPage(
  kind: FinanceKind,
  partyId: string,
  opts: { page: number; pageSize: number; search?: string; status?: 'active' | 'voided' },
): Promise<PaginatedFinanceDocs> {
  return selectDocPageForParty(kind, partyId, toRange(opts.page, opts.pageSize), {
    search: opts.search,
    status: opts.status,
  })
}

/** The three fields the caller's stat cards sum over - the COMPLETE set, not a page. */
export async function myDocTotals(kind: FinanceKind, partyId: string) {
  return selectPartyDocTotals(kind, partyId)
}

/** Every document, newest first. Unbounded - use only for the explicit CSV
 *  export. Reads the whole ledger via the service-role client, so the CALLER
 *  MUST have proved viewFinance first (the export handler does). */
export async function listAllDocs(kind: FinanceKind): Promise<FinanceDoc[]> {
  return selectAllDocs(kind)
}

/** The most recent documents, newest first - bounded, for ledger/preview views. */
export async function listRecentDocs(kind: FinanceKind, limit = 100): Promise<FinanceDoc[]> {
  return selectRecentDocs(kind, limit)
}

/** Page-through + search/filter for the admin finance ledger, so the admin can
 *  reach documents beyond the newest window and find a specific one. */
export async function listDocsPage(
  kind: FinanceKind,
  opts: { page: number; pageSize: number; search?: string; status?: 'active' | 'voided' },
): Promise<PaginatedFinanceDocs> {
  return selectDocPage(kind, {
    ...toRange(opts.page, opts.pageSize),
    search: opts.search,
    status: opts.status,
  })
}

/** Per-kind totals already normalised into the academy base currency, with a
 *  count of documents still awaiting a rate. Used by the dashboard rollups. */
export async function financeTotalsBase(kind: FinanceKind): Promise<FinanceBaseTotal> {
  return callFinanceTotalsBase(kind)
}

/** One document by id (RLS: own or admin). */
export async function getDoc(kind: FinanceKind, id: string): Promise<FinanceDoc | null> {
  return selectDocById(kind, id)
}

/** Line items for a document. The lines tables have no policy of their own, so
 *  the caller must have proved access to the parent document first - every
 *  current caller reaches them via getDoc, which is RLS-scoped. */
export async function getDocLines(kind: FinanceKind, id: string): Promise<FinanceLine[]> {
  return selectDocLines(kind, id)
}

/** Issues a finance document atomically inside the database, including number
 *  allocation and line insertion. Admin-only. */
export async function issueDocRecord(
  actorId: string,
  kind: FinanceKind,
  doc: IssueFinanceDocInput,
): Promise<FinanceDoc> {
  await requireActorCapability(actorId, 'manageAdminTier', FINANCE_DENIED)
  const issued = await callIssueDoc(kind, doc)
  // Minting a financial document is the most consequential act on this surface, so it is
  // recorded like every other privileged write. The number and party go in the metadata:
  // an auditor asking "who issued CEA-R-0042, and to whom" must not have to infer it from
  // the row, which a later void leaves looking the same either way.
  await auditPrivilegedAction({ id: actorId }, `${kind}.issue`, kind, issued.id, {
    number: issued.number,
    party_id: doc.party_id,
    total: issued.total,
    currency: issued.currency,
  })
  return issued
}

/**
 * Marks a document void (immutable finance model: correction = void + reissue).
 * Admin-only. Returns false if no live document with that id existed (unknown id
 * or already voided) so the caller can 404 instead of reporting a phantom success.
 */
export async function voidDoc(actorId: string, kind: FinanceKind, id: string): Promise<boolean> {
  await requireActorCapability(actorId, 'manageAdminTier', FINANCE_DENIED)
  const voided = await updateDocVoided(kind, id)
  // Only a real transition is audited. updateDocVoided returns false for an unknown id or
  // one already void, and recording those would fill the trail with events that never
  // happened - the same reason a disclosure that discloses nothing is not audited.
  if (voided) await auditPrivilegedAction({ id: actorId }, `${kind}.void`, kind, id)
  return voided
}
