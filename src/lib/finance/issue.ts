import 'server-only'
import { lineAmount, computeTotals } from '@/lib/money'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { getProfileById } from '@/lib/services/users'
import { issueDocRecord, type FinanceKind, type FinanceLine } from '@/lib/services/finance/finance-docs'
import { writeAudit } from '@/lib/data/audit'
import { ValidationError } from '@/lib/errors'
import { issueDocSchema, type IssueDocInput } from '@/lib/validation/finance'

/**
 * Issuance only records the document (validate -> totals -> allocate number ->
 * insert -> audit). The PDF is generated on demand when downloaded (see
 * lib/finance/render.ts), so nothing is stored. Receipts snapshot the student's
 * class; pay slips have no class.
 */
async function issueDoc(
  kind: FinanceKind,
  input: IssueDocInput,
  actorId: string,
): Promise<{ id: string; number: string }> {
  // Receipts are issued to a student; pay slips to a payee - a tutor OR a
  // dedicated (non-tutor) mentor, who is otherwise unpayable. The party must also
  // be ACTIVE: don't issue a financial document to a disabled/revoked account.
  const party = await getProfileById(input.party_id)
  const allowedRoles = kind === 'receipt' ? ['student'] : ['tutor', 'mentor']
  if (!party || !allowedRoles.includes(party.role) || party.status !== 'active') {
    // A stale/wrong party_id is a client-correctable input error, not a server
    // fault: ValidationError maps to 400 in the handler, so it doesn't pollute
    // the 5xx error budget as a bare Error would.
    throw new ValidationError(`No ${kind === 'receipt' ? 'active student' : 'active payee'} found for that selection.`)
  }

  const lines: FinanceLine[] = input.lines.map((l) => ({
    label: l.subject,
    hours: l.hours,
    rate: l.rate,
    amount: lineAmount(l.hours, l.rate, input.currency),
  }))
  const { subtotal, discount: roundedDiscount, total } = computeTotals(input.lines, input.discount ?? 0, input.currency)
  const org = await getOrgSettings()
  const prefix = kind === 'receipt' ? org.receipt_prefix : org.payslip_prefix

  const doc = await issueDocRecord(actorId, kind, {
    party_id: party.id,
    party_name: party.full_name ?? party.email,
    class_level: kind === 'receipt' ? party.class_level : null,
    issue_date: input.issue_date,
    currency: input.currency,
    note: input.note ?? null,
    subtotal,
    // Store the rounded discount (null only when none was given) so the stored
    // subtotal/discount/total are mutually consistent to the currency's minor unit.
    discount: input.discount == null ? null : roundedDiscount,
    total,
    created_by: actorId,
    prefix,
    lines,
  })

  // Best-effort: the document is already committed (numbered + line items) by
  // issueDocRecord above. If the audit insert threw, a 500 would send the admin
  // to retry and issue a SECOND, duplicate-numbered document - a far worse
  // outcome than a missing audit row. Log the gap and report success instead.
  try {
    await writeAudit({ actor_id: actorId, action: `${kind}.issue`, entity_type: kind, entity_id: doc.id })
  } catch (auditError) {
    console.error(`[finance] audit write failed for issued ${kind} ${doc.id}:`, auditError)
  }
  return { id: doc.id, number: doc.number }
}

function validateIssueDocInput(input: unknown): IssueDocInput {
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
