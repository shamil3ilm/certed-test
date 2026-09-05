import 'server-only'
import { lineAmount, computeTotals } from '@/lib/money'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { getProfileById } from '@/lib/services/users'
import { issueDocRecord, type FinanceKind, type FinanceLine } from '@/lib/services/finance/finance-docs'
import { convertIssuedDoc } from '@/lib/services/finance/fx-conversion'
import { writeAudit } from '@/lib/data/audit'
import { ValidationError } from '@/lib/errors'
import { buildBillingDraft } from '@/lib/services/finance/hours-billing'
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

  // ── C-05: the POST body was the sole source of truth ────────────────────────
  // buildBillingDraft only ever FILLED the browser form; nothing on the way back in was
  // checked against the server's own numbers. The rate was never compared to
  // billing_rates, the currency came from the body rather than the party's stored rate,
  // and the hours were free numbers - so a crafted POST could bill any rate, in any
  // currency, for any number of hours. Finance write is admin-only, so this is an
  // integrity control rather than an escalation, but it is the difference between "an
  // admin can mistype" and "the document need not resemble anything that happened".
  //
  // Checked, not overridden: a request naming a billing period is reconciled against the
  // recorded month, and anything it cannot justify is refused. Billing FEWER hours than
  // recorded stays allowed - waiving part of a month is a real thing an academy does, and
  // silently rewriting the admin's figures would be worse than refusing them.
  const derived = input.billing_period ? await buildBillingDraft(actorId, kind, party.id, input.billing_period) : null
  if (derived?.blocked) throw new ValidationError(derived.blocked)

  const currency = derived ? derived.currency : input.currency
  if (derived && input.currency !== derived.currency) {
    throw new ValidationError(
      `This ${kind === 'receipt' ? 'student' : 'payee'} is billed in ${derived.currency}, not ${input.currency}.`,
    )
  }

  if (derived) {
    const expectedRate = derived.lines[0]?.rate
    const recordedHours = derived.lines.reduce((sum, l) => sum + l.hours, 0)
    const requestedHours = input.lines.reduce((sum, l) => sum + l.hours, 0)
    const wrongRate = expectedRate != null && input.lines.some((l) => l.rate !== expectedRate)
    if (wrongRate) {
      throw new ValidationError(`The rate must match this ${kind === 'receipt' ? 'student' : 'payee'}'s stored rate.`)
    }
    // Rounded to the hundredth before comparing: hours are derived from minutes, so an
    // exact float equality would reject a figure the UI itself produced.
    if (Math.round(requestedHours * 100) > Math.round(recordedHours * 100)) {
      throw new ValidationError(
        `Billing ${requestedHours}h exceeds the ${recordedHours}h recorded for ${input.billing_period}.`,
      )
    }
  }

  const lines: FinanceLine[] = input.lines.map((l) => ({
    label: l.subject,
    hours: l.hours,
    rate: l.rate,
    amount: lineAmount(l.hours, l.rate, currency),
  }))
  const { subtotal, discount: roundedDiscount, total } = computeTotals(input.lines, input.discount ?? 0, currency)
  const org = await getOrgSettings()
  const prefix = kind === 'receipt' ? org.receipt_prefix : org.payslip_prefix

  const doc = await issueDocRecord(actorId, kind, {
    party_id: party.id,
    party_name: party.full_name ?? party.email,
    class_level: kind === 'receipt' ? party.class_level : null,
    issue_date: input.issue_date,
    currency,
    note: input.note ?? null,
    subtotal,
    // Store the rounded discount (null only when none was given) so the stored
    // subtotal/discount/total are mutually consistent to the currency's minor unit.
    discount: input.discount == null ? null : roundedDiscount,
    total,
    created_by: actorId,
    prefix,
    lines,
    billing_period: input.billing_period ?? null,
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

  // Snapshot the base-currency amount at the rate effective on the issue date.
  // Best-effort, like the audit: a missing rate (or a transient failure) leaves
  // the document unconverted for the next admin recompute rather than failing an
  // already-committed issuance.
  try {
    await convertIssuedDoc(kind, doc.id)
  } catch (fxError) {
    console.error(`[finance] base-currency conversion failed for issued ${kind} ${doc.id}:`, fxError)
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
