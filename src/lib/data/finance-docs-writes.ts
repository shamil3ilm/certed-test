import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FinanceDoc, FinanceKind } from './finance-docs'
import { toDoc, type IssueFinanceDocInput } from './finance-docs-shared'
import { ValidationError } from '@/lib/errors'

export async function callIssueDoc(kind: FinanceKind, doc: IssueFinanceDocInput): Promise<FinanceDoc> {
  const admin = createAdminClient()
  const fn = kind === 'receipt' ? 'issue_receipt_doc' : 'issue_payslip_doc'
  const { data, error } = await admin.rpc(fn, {
    p_party_id: doc.party_id,
    p_party_name: doc.party_name,
    p_class_level: doc.class_level,
    p_issue_date: doc.issue_date,
    p_currency: doc.currency,
    p_note: doc.note,
    p_subtotal: doc.subtotal,
    p_discount: doc.discount,
    p_total: doc.total,
    p_created_by: doc.created_by,
    p_prefix: doc.prefix,
    p_lines: doc.lines,
    p_billing_period: doc.billing_period,
  })
  if (error) {
    // 0100 added a partial unique index: one LIVE document per party per billing period.
    // That turns a duplicate issue from "two documents quietly exist" into a database
    // refusal - but the handler maps anything that is not a ValidationError to a generic
    // 500, so an admin double-clicking Issue would be told the server broke. It did not:
    // the month is already billed, which is a correctable thing they can see and act on.
    // 23505 = unique_violation.
    if ((error as { code?: string }).code === '23505' && /billing_period/.test(error.message)) {
      throw new ValidationError(
        `A ${kind === 'receipt' ? 'receipt' : 'pay slip'} has already been issued to this ` +
          `${kind === 'receipt' ? 'student' : 'payee'} for that month. Void the existing one before reissuing.`,
      )
    }
    throw new Error(`${kind}.issue: ${error.message}`)
  }
  return toDoc(kind, data as Record<string, unknown>)
}

export async function updateDocVoided(kind: FinanceKind, id: string): Promise<boolean> {
  const admin = createAdminClient()
  const table = kind === 'receipt' ? 'receipts' : 'payslips'
  const { data, error } = await admin.from(table).update({ voided: true }).eq('id', id).eq('voided', false).select('id')
  if (error) throw new Error(`${kind}.void: ${error.message}`)
  return (data?.length ?? 0) > 0
}
