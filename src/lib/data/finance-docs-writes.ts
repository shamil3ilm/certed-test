import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FinanceDoc, FinanceKind } from './finance-docs'
import { KIND, toDoc, type IssueFinanceDocInput } from './finance-docs-shared'
import { FINANCE_KINDS } from '@/lib/finance/kinds'
import { ValidationError } from '@/lib/errors'
import { refusalOf } from '@/lib/data/rpc-refusal'

export async function callIssueDoc(kind: FinanceKind, doc: IssueFinanceDocInput): Promise<FinanceDoc> {
  const admin = createAdminClient()
  const fn = KIND[kind].issueFn
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
    p_source_fingerprint: doc.billing_source?.fingerprint ?? null,
    p_source_from: doc.billing_source?.from ?? null,
    p_source_to: doc.billing_source?.to ?? null,
  })
  if (error) {
    const { noun, partyNoun } = FINANCE_KINDS[kind]
    // 0110: the recorded hours moved between the draft and the write.
    if (refusalOf(error, ['billing_source_changed'] as const)) {
      throw new ValidationError(
        `The recorded hours changed while this ${noun} was being issued. Reload the draft, check the figures ` +
          `and issue again.`,
      )
    }
    // 0110: a document with no billing period whose identical twin was issued moments ago.
    const duplicate = /duplicate_recent:(\S+)/.exec(error.message)
    if (duplicate) {
      throw new ValidationError(
        `An identical ${noun} (${duplicate[1]}) was just issued to this ${partyNoun}. Open it to check before ` +
          `issuing another.`,
      )
    }
    // 0100 added a partial unique index: one LIVE document per party per billing period.
    // That turns a duplicate issue from "two documents quietly exist" into a database
    // refusal - but the handler maps anything that is not a ValidationError to a generic
    // 500, so an admin double-clicking Issue would be told the server broke. It did not:
    // the month is already billed, which is a correctable thing they can see and act on.
    // 23505 = unique_violation.
    if ((error as { code?: string }).code === '23505' && /billing_period/.test(error.message)) {
      throw new ValidationError(
        `A ${noun} has already been issued to this ` +
          `${partyNoun} for that month. Void the existing one before reissuing.`,
      )
    }
    throw new Error(`${kind}.issue: ${error.message}`)
  }
  return toDoc(kind, data as Record<string, unknown>)
}

export async function updateDocVoided(kind: FinanceKind, id: string): Promise<boolean> {
  const admin = createAdminClient()
  const { table } = KIND[kind]
  const { data, error } = await admin.from(table).update({ voided: true }).eq('id', id).eq('voided', false).select('id')
  if (error) throw new Error(`${kind}.void: ${error.message}`)
  return (data?.length ?? 0) > 0
}
