import type { FinanceDoc, FinanceKind, FinanceLine } from './finance-docs'

export const KIND = {
  receipt: {
    table: 'receipts',
    lineTable: 'receipt_lines',
    partyCol: 'student_id',
    nameCol: 'student_name_snapshot',
    labelCol: 'subject',
    fkCol: 'receipt_id',
    hasClass: true,
  },
  payslip: {
    table: 'payslips',
    lineTable: 'payslip_lines',
    partyCol: 'tutor_id',
    nameCol: 'tutor_name_snapshot',
    labelCol: 'label',
    fkCol: 'payslip_id',
    hasClass: false,
  },
} as const

export function docColumns(k: (typeof KIND)[FinanceKind]): string {
  return [
    'id',
    'number',
    k.partyCol,
    k.nameCol,
    ...(k.hasClass ? ['class_snapshot'] : []),
    'issue_date',
    'currency',
    'note',
    'subtotal',
    'discount',
    'total',
    'base_currency',
    'base_total',
    'voided',
    'created_by',
    'created_at',
  ].join(', ')
}

export function toDoc(kind: FinanceKind, row: Record<string, unknown>): FinanceDoc {
  const k = KIND[kind]
  return {
    id: row.id as string,
    number: row.number as string,
    party_id: (row[k.partyCol] as string | null) ?? null,
    party_name: row[k.nameCol] as string,
    class_level: k.hasClass ? ((row.class_snapshot as string | null) ?? null) : null,
    issue_date: row.issue_date as string,
    currency: row.currency as string,
    note: (row.note as string | null) ?? null,
    subtotal: Number(row.subtotal),
    discount: row.discount == null ? null : Number(row.discount),
    total: Number(row.total),
    base_currency: (row.base_currency as string | null) ?? null,
    base_total: row.base_total == null ? null : Number(row.base_total),
    voided: Boolean(row.voided),
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

export type FinanceTotal = { currency: string; live_total: number; live_count: number }

export type IssueFinanceDocInput = Omit<
  {
    number: string
    party_id: string
    party_name: string
    class_level: string | null
    issue_date: string
    currency: string
    note: string | null
    subtotal: number
    discount: number | null
    total: number
    created_by: string | null
  },
  'number'
> & {
  prefix: string
  lines: FinanceLine[]
}
