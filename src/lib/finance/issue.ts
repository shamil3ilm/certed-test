import 'server-only'
import { lineAmount, computeTotals } from '@/lib/money'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { getProfileById } from '@/lib/services/users'
import { issueDocRecord, type FinanceKind, type FinanceLine } from '@/lib/services/finance/finance-docs'
import { writeAudit } from '@/lib/repos/audit'
import { ValidationError } from '@/lib/errors'
import { issueDocSchema, type IssueDocInput } from '@/lib/validation/finance'

/**
 * Issuance only records the document (validate -> totals -> allocate number ->
 * insert -> audit). The PDF is generated on demand when downloaded (see
 * lib/finance/render.ts), so nothing is stored. Receipts snapshot the student's
 * class; pay slips have no class.
 */
export async function issueDoc(
  kind: FinanceKind,
  input: IssueDocInput,
  actorId: string,
): Promise<{ id: string; number: string }> {
  const party = await getProfileById(input.party_id)
  const expectedRole = kind === 'receipt' ? 'student' : 'tutor'
  if (!party || party.role !== expectedRole) throw new Error(`${expectedRole} not found`)

  const lines: FinanceLine[] = input.lines.map((l) => ({
    label: l.subject,
    hours: l.hours,
    rate: l.rate,
    amount: lineAmount(l.hours, l.rate, input.currency),
  }))
  const { subtotal, total } = computeTotals(input.lines, input.discount ?? 0, input.currency)
  const org = await getOrgSettings()
  const prefix = kind === 'receipt' ? org.receipt_prefix : org.payslip_prefix

  const doc = await issueDocRecord(
    kind,
    {
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
      prefix,
      lines,
    },
  )

  await writeAudit({ actor_id: actorId, action: `${kind}.issue`, entity_type: kind, entity_id: doc.id })
  return { id: doc.id, number: doc.number }
}

export function validateIssueDocInput(input: unknown): IssueDocInput {
  const parsed = issueDocSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('invalid input')
  }
  return parsed.data
}

export async function issueDocFromApiInput(
  kind: FinanceKind,
  input: unknown,
  actorId: string,
): Promise<{ id: string; number: string }> {
  return issueDoc(kind, validateIssueDocInput(input), actorId)
}
