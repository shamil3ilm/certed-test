import { requireActorCapability } from '@/lib/services/authorization'
import { ValidationError } from '@/lib/errors'
import { z } from 'zod'
import {
  callFinanceTotals,
  callIssueDoc,
  selectAllDocs,
  selectDocById,
  selectDocLines,
  selectDocPage,
  selectDocsForParty,
  selectRecentDocs,
  updateDocVoided,
  type FinanceDoc,
  type FinanceKind,
  type FinanceLine,
  type FinanceTotal,
  type IssueFinanceDocInput,
} from '@/lib/data/finance-docs'

/**
 * Receipts and pay slips. The finance model is immutable: a document is never
 * edited, and a correction is a void plus a reissue.
 *
 * Table access lives in src/lib/data/finance-docs, which also owns the
 * receipt/payslip shape difference so nothing here touches a raw column name.
 *
 * Issuing and voiding now enforce their OWN permission check. This module used
 * to be a documented exception - its mutations relied on each caller gating
 * first - which held only as long as every future caller remembered. They gate
 * on manageAdminTier, the hard-rule admin-tier marker that is never
 * override-grantable, so the effective rule is exactly the admin-only one the
 * API routes already applied; those routes keep their requireRoleApi check as
 * the transport-level gate, making this defence in depth rather than a move.
 */

const FINANCE_DENIED = 'You are not allowed to manage finance documents.'

export type { FinanceDoc, FinanceKind, FinanceLine, FinanceTotal, IssueFinanceDocInput }
export type { NewFinanceDoc } from '@/lib/data/finance-docs'
export type PaginatedFinanceDocs = { items: FinanceDoc[]; total: number }

const financeDocIdSchema = z.string().uuid()

export function validateFinanceDocId(input: unknown): string {
  const parsed = financeDocIdSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid finance document id')
  }
  return parsed.data
}

/** A caller's own documents (RLS-scoped), newest first. */
export async function listMyDocs(kind: FinanceKind, partyId: string): Promise<FinanceDoc[]> {
  return selectDocsForParty(kind, partyId)
}

/** Every document (admin session; RLS lets admin read all), newest first.
 *  Unbounded - use only for the explicit CSV export, not for page/dashboard reads. */
export async function listAllDocs(kind: FinanceKind): Promise<FinanceDoc[]> {
  return selectAllDocs(kind)
}

/** The most recent documents, newest first - bounded, for ledger/preview views. */
export async function listRecentDocs(kind: FinanceKind, limit = 100): Promise<FinanceDoc[]> {
  return selectRecentDocs(kind, limit)
}

/** Real page-through + search/filter for the admin finance ledger - the page
 *  previously fetched a flat newest-200 window with no way to reach anything
 *  older or find a specific document. */
export async function listDocsPage(
  kind: FinanceKind,
  opts: { page: number; pageSize: number; search?: string; status?: 'active' | 'voided' },
): Promise<PaginatedFinanceDocs> {
  const from = (opts.page - 1) * opts.pageSize
  const { rows, total } = await selectDocPage(kind, {
    from,
    to: from + opts.pageSize - 1,
    search: opts.search,
    status: opts.status,
  })
  return { items: rows, total }
}

/** Per-currency, non-voided totals computed in SQL - no rows shipped to the app. */
export async function financeTotals(kind: FinanceKind): Promise<FinanceTotal[]> {
  return callFinanceTotals(kind)
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
  return callIssueDoc(kind, doc)
}

/**
 * Marks a document void (immutable finance model: correction = void + reissue).
 * Admin-only. Returns false if no live document with that id existed (unknown id
 * or already voided) so the caller can 404 instead of reporting a phantom success.
 */
export async function voidDoc(actorId: string, kind: FinanceKind, id: string): Promise<boolean> {
  await requireActorCapability(actorId, 'manageAdminTier', FINANCE_DENIED)
  return updateDocVoided(kind, id)
}
