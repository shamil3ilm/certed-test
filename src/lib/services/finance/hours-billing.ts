import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { computeTotals, lineAmount, SUPPORTED_CURRENCIES } from '@/lib/money'
import { getProfileById } from '@/lib/services/users'
import { getAcademyClassHours } from '@/lib/services/teaching-hours'
import { selectBillingRatesFor, selectPartiesWithDocForPeriod } from '@/lib/data/billing-rates'
import type { FinanceKind } from '@/lib/data/finance-docs'

/**
 * Turn RECORDED CLASS HOURS into a ready-to-issue receipt or pay slip.
 *
 * This builds a DRAFT and nothing else. It never issues: a finance document is numbered
 * from a shared counter and can only be voided, never edited, so the last step stays a
 * human pressing Issue on figures they can see. Everything up to that point - which
 * classes, how many hours, at what rate, and whether this month was already billed - is
 * derived here.
 *
 * The two kinds are the two sides of the SAME sessions:
 *   - a receipt bills a student for the hours they RECEIVED (the sessions they were marked
 *     present or late for),
 *   - a pay slip pays a tutor/mentor for the hours they TAUGHT.
 * Neither is a partition of the other; see docs/workflow-invariants.md section 4a.
 */

export interface DraftLine {
  /** The class name. Stored as receipt_lines.subject / payslip_lines.label. */
  subject: string
  hours: number
  rate: number
  amount: number
}

export interface BillingDraft {
  kind: FinanceKind
  partyId: string
  partyName: string
  /** 'YYYY-MM' the draft bills for. */
  period: string
  currency: string
  lines: DraftLine[]
  subtotal: number
  total: number
  /** Reasons the admin should look twice before issuing. Never blocking. */
  warnings: string[]
  /** Set when there is nothing to issue; `lines` is then empty. */
  blocked: string | null
}

/** Minutes -> hours at 2dp, matching payslip_lines.hours / receipt_lines.hours
 *  (numeric(8,2)). Rounding here rather than at render keeps the stored hours and the
 *  amount computed from them consistent. */
function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

function empty(kind: FinanceKind, party: Profile, period: string, currency: string, reason: string): BillingDraft {
  return {
    kind,
    partyId: party.id,
    partyName: party.full_name ?? party.email,
    period,
    currency,
    lines: [],
    subtotal: 0,
    total: 0,
    warnings: [],
    blocked: reason,
  }
}

/**
 * Build the draft for one party and month.
 *
 * `actor` is not consulted here - the caller is already admin-gated (issuing is
 * structurally admin-only) and every read below runs under the service role.
 */
export async function buildBillingDraft(kind: FinanceKind, partyId: string, period: string): Promise<BillingDraft> {
  const party = await getProfileById(partyId)
  const allowedRoles = kind === 'receipt' ? ['student'] : ['tutor', 'mentor']
  if (!party || !allowedRoles.includes(party.role) || party.status !== 'active') {
    throw new Error(`No active ${kind === 'receipt' ? 'student' : 'payee'} for that selection.`)
  }

  const rate = (await selectBillingRatesFor([partyId])).get(partyId)
  // A missing rate is the common first-run state, and the only honest response is to say
  // so: billing zero hours at zero would produce a valid-looking document for nothing.
  const perHour = kind === 'receipt' ? (rate?.fee_rate ?? null) : (rate?.pay_rate ?? null)
  const currency = rate?.currency ?? 'INR'
  if (rate == null || perHour == null) {
    const which = kind === 'receipt' ? 'fee rate' : 'pay rate'
    return empty(kind, party, period, currency, `No ${which} is set for ${party.full_name ?? party.email}.`)
  }
  // Defensive: the column is free text at the database level beyond its regex, and an
  // unsupported code would make every later render of the document throw.
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return empty(kind, party, period, 'INR', `${currency} is not a currency this system can issue.`)
  }

  const { tutorClasses, studentClasses } = await getAcademyClassHours(period)

  // One line per class, from whichever side of the report this kind bills.
  const perClass: Array<{ subject: string; minutes: number }> =
    kind === 'receipt'
      ? studentClasses.flatMap((c) =>
          c.students.filter((s) => s.studentId === partyId).map((s) => ({ subject: c.className, minutes: s.minutes })),
        )
      : tutorClasses.flatMap((c) =>
          c.tutors.filter((t) => t.tutorId === partyId).map((t) => ({ subject: c.className, minutes: t.minutes })),
        )

  // A class with recorded sessions but no recorded WINDOW contributes 0 minutes. Billing a
  // zero-hour line is meaningless and the issue schema rejects it (hours must be positive),
  // so those are dropped here rather than failing validation later.
  const lines: DraftLine[] = perClass
    .filter((entry) => entry.minutes > 0)
    .map((entry) => {
      const hours = toHours(entry.minutes)
      return { subject: entry.subject, hours, rate: perHour, amount: lineAmount(hours, perHour, currency) }
    })
    .filter((line) => line.hours > 0)
    .sort((a, b) => b.amount - a.amount || a.subject.localeCompare(b.subject))

  if (lines.length === 0) {
    const side = kind === 'receipt' ? 'attended no recorded sessions' : 'taught no recorded sessions'
    return empty(kind, party, period, currency, `${party.full_name ?? party.email} ${side} in this month.`)
  }

  const { subtotal, total } = computeTotals(lines, 0, currency)

  const warnings: string[] = []
  if ((await selectPartiesWithDocForPeriod(kind, period)).has(partyId)) {
    warnings.push(
      `A ${kind === 'receipt' ? 'receipt' : 'pay slip'} for this month has already been issued to this ` +
        `${kind === 'receipt' ? 'student' : 'payee'} and has not been voided. Issuing again will create a second document.`,
    )
  }

  return {
    kind,
    partyId,
    partyName: party.full_name ?? party.email,
    period,
    currency,
    lines,
    subtotal,
    total,
    warnings,
    blocked: null,
  }
}
