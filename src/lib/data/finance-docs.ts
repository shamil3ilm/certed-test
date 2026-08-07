export type FinanceKind = 'receipt' | 'payslip'

export type FinanceLine = { label: string; hours: number; rate: number; amount: number }

export type FinanceDoc = {
  id: string
  number: string
  party_id: string | null
  party_name: string
  class_level: string | null
  issue_date: string
  currency: string
  note: string | null
  subtotal: number
  discount: number | null
  total: number
  /** Reporting overlay: the document's total converted into the academy's base
   *  currency at the rate effective on its issue_date. Null until an admin has a
   *  rate for that date (see @/lib/services/finance/fx-conversion). */
  base_currency: string | null
  base_total: number | null
  fx_rate: number | null
  voided: boolean
  created_by: string | null
  created_at: string
}

export * from './finance-docs-shared'
export * from './finance-docs-reads'
export * from './finance-docs-writes'
