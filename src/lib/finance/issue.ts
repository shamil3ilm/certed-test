import 'server-only'
import { lineAmount, computeTotals } from '@/lib/money'
import { getOrgSettings } from '@/lib/repos/orgSettings'
import { allocateNumber } from '@/lib/repos/documentCounters'
import { getProfileById } from '@/lib/repos/users'
import { insertDoc, type FinanceKind, type FinanceLine } from '@/lib/repos/financeDocs'
import { writeAudit } from '@/lib/repos/audit'
import type { IssueDocInput } from '@/lib/validation/finance'

/**
 * Issuance only records the document (validate → totals → allocate number →
 * insert → audit). The PDF is generated on demand when downloaded (see
 * lib/finance/render.ts), so nothing is stored. Receipts snapshot the student's
 * class; pay slips have no class.
 */
export async function issueDoc(
  kind: FinanceKind,
  input: IssueDocInput,
  actorId: string,
): Promise<{ id: string; number: string }> {
  const party = await getProfileById(input.party_id)
  if (!party) throw new Error(`${kind === 'receipt' ? 'student' : 'teacher'} not found`)

  const lines: FinanceLine[] = input.lines.map((l) => ({
    label: l.subject,
    hours: l.hours,
    rate: l.rate,
    amount: lineAmount(l.hours, l.rate, input.currency),
  }))
  const { subtotal, total } = computeTotals(input.lines, input.discount ?? 0, input.currency)
  const org = await getOrgSettings()
  const year = new Date(input.issue_date).getFullYear()
  const prefix = kind === 'receipt' ? org.receipt_prefix : org.payslip_prefix
  const number = await allocateNumber(kind, prefix, year)

  const doc = await insertDoc(
    kind,
    {
      number,
      party_id: party.id,
      party_name: party.full_name ?? party.email,
      class_level: kind === 'receipt' ? party.class_level : null,
      issue_date: input.issue_date,
      currency: input.currency,
      note: input.note ?? null,
      subtotal,
      discount: input.discount ?? null,
      total,
      created_by: actorId,
    },
    lines,
  )

  await writeAudit({ actor_id: actorId, action: `${kind}.issue`, entity_type: kind, entity_id: doc.id })
  return { id: doc.id, number }
}
