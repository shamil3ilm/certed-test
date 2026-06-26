import { createAdminClient } from '@/lib/supabase/admin'
import { receiptNumber } from '@/lib/repos/orgSettings'

/**
 * Allocates the next sequential document number atomically (via the
 * `next_document_number` Postgres function) and formats it, e.g. `CEA-R-2026-0007`.
 */
export async function allocateNumber(
  docType: 'receipt' | 'payslip',
  prefix: string,
  year: number,
): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('next_document_number', {
    p_doc_type: docType,
    p_year: year,
  })
  if (error) throw new Error(`counters.allocate: ${error.message}`)
  return receiptNumber(prefix, year, data as number)
}
