import { callNextDocumentNumber } from '@/lib/data/finance-docs'
import { receiptNumber } from '@/lib/services/finance/org-settings'

/**
 * Allocates the next sequential document number and formats it, e.g.
 * `CEA-R-2026-0007`. The allocation itself is atomic in the database (the
 * `next_document_number` function), so two concurrent issues can never take the
 * same number.
 */
export async function allocateNumber(docType: 'receipt' | 'payslip', prefix: string, year: number): Promise<string> {
  return receiptNumber(prefix, year, await callNextDocumentNumber(docType, year))
}
