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
  voided: boolean
  created_by: string | null
  created_at: string
}

export * from './finance-docs-shared'
export * from './finance-docs-reads'
export * from './finance-docs-writes'
