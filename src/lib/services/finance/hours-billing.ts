import 'server-only'
import type { Profile } from '@/lib/auth/profile'
import { computeTotals, lineAmount, SUPPORTED_CURRENCIES } from '@/lib/money'
import { getProfileById } from '@/lib/services/users'
import { getAcademyClassHours } from '@/lib/services/teaching-hours'
import { getAcademyBreakdown, getPersonWork, NO_SUBJECT } from '@/lib/services/hours-breakdown'
import { selectBillingRatesFor, selectPartiesWithDocForPeriod } from '@/lib/data/billing-rates'
import { countSelfRecordedSessions } from '@/lib/data/class-sessions'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { monthWindow } from '@/lib/time/month-window'
import type { FinanceKind } from '@/lib/data/finance-docs'
import { FINANCE_KINDS, isFinanceParty } from '@/lib/finance/kinds'
import { ValidationError } from '@/lib/errors'

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
  /** What the line is FOR: the subject the month's sessions recorded, or the class name
   *  when they name no single subject. Stored as receipt_lines.subject / payslip_lines.label. */
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
 * What a pay slip pays for: the sessions the payee WORKED, which is the ledger they see as My hours.
 * That is the classes they taught and the exams they monitored - an exam someone else monitored is
 * that monitor's working time - and never a demo class, which is not working time at all. The pay
 * SQL (0126) applies the same rule to the fingerprint and the billed-hours lock, so the figure here
 * and the guard behind it cannot disagree about whose hours these are.
 *
 * One line per class and subject. A session with no recorded window has no minutes and is dropped
 * by the caller; a class with no subject set reads as the class name.
 */
async function workedByClass(
  actorId: string,
  partyId: string,
  period: string,
  classNames: ReadonlyMap<string, string>,
): Promise<Array<{ subject: string; minutes: number }>> {
  const work = await getPersonWork(actorId, partyId, period)
  const lines = new Map<string, { subject: string; minutes: number }>()
  for (const row of work?.ledger ?? []) {
    if (row.kind === 'demo') continue
    const key = `${row.classId}|${row.subjectName}`
    const line = lines.get(key) ?? {
      subject: row.subjectName !== NO_SUBJECT ? row.subjectName : (classNames.get(row.classId) ?? row.subjectName),
      minutes: 0,
    }
    line.minutes += row.minutes
    lines.set(key, line)
  }
  return [...lines.values()]
}

/**
 * Build the draft for one party and month.
 *
 * `actor` is not consulted here - the caller is already admin-gated (issuing is
 * structurally admin-only) and every read below runs under the service role.
 */
export async function buildBillingDraft(
  actorId: string,
  kind: FinanceKind,
  partyId: string,
  period: string,
): Promise<BillingDraft> {
  const party = await getProfileById(partyId)
  const kindRules = FINANCE_KINDS[kind]
  if (!party || !isFinanceParty(kind, party.role) || party.status !== 'active') {
    throw new ValidationError(`No active ${kindRules.partyNoun} for that selection.`)
  }

  const rate = (await selectBillingRatesFor([partyId])).get(partyId)
  // A missing rate is the common first-run state, and the only honest response is to say
  // so: billing zero hours at zero would produce a valid-looking document for nothing.
  const perHour = rate?.[kindRules.rateField] ?? null
  const currency = rate?.currency ?? 'INR'
  if (rate == null || perHour == null) {
    const which = kindRules.rateNoun
    return empty(kind, party, period, currency, `No ${which} is set for ${party.full_name ?? party.email}.`)
  }
  // Defensive: the column is free text at the database level beyond its regex, and an
  // unsupported code would make every later render of the document throw.
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return empty(kind, party, period, 'INR', `${currency} is not a currency this system can issue.`)
  }

  const { tutorClasses, studentClasses } = await getAcademyClassHours(actorId, period)

  // One line per class, from whichever side of the report this kind bills.
  const perClass: Array<{ subject: string; minutes: number }> =
    kind === 'receipt'
      ? studentClasses.flatMap((c) =>
          c.students
            .filter((s) => s.studentId === partyId)
            .map((s) => ({ subject: c.subjectName ?? c.className, minutes: s.minutes })),
        )
      : await workedByClass(actorId, partyId, period, new Map(tutorClasses.map((c) => [c.classId, c.className])))

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
    const side = `${kindRules.sessionsVerb} no recorded sessions`
    return empty(kind, party, period, currency, `${party.full_name ?? party.email} ${side} in this month.`)
  }

  const { subtotal, total } = computeTotals(lines, 0, currency)

  const warnings: string[] = []
  if ((await selectPartiesWithDocForPeriod(kind, period)).has(partyId)) {
    warnings.push(
      // 0100 makes this a REFUSAL, not a duplicate: receipts_one_live_per_party_period /
      // payslips_one_live_per_party_period are unique over (party, billing_period) where the
      // document is live. Saying "will create a second document" told the admin the opposite
      // of what happens, and sent them to click through a warning into a hard error.
      `A ${kindRules.noun} for this month has already been issued to this ` +
        `${kindRules.partyNoun} and has not been voided. Void it first - a second live ` +
        `document for the same month is refused.`,
    )
  }

  // Demo classes and exams are recorded apart from regular ones. WHO a pay slip pays is settled (the
  // worker, never for a demo - see workedByClass); what an exam or a demo is WORTH is not, so the
  // draft prices every counted session at the one hourly rate and says so when the month holds any.
  const breakdown = await getAcademyBreakdown(actorId, period)
  const mine =
    kind === 'receipt'
      ? breakdown.students.find((s) => s.studentId === partyId)?.total
      : breakdown.people.find((p) => p.personId === partyId)?.minutes
  if (mine && kind === 'payslip') {
    if (mine.demo > 0) {
      warnings.push(`${toHours(mine.demo)} h of demo classes this month are not paid: a demo is not working time.`)
    }
    if (mine.exam > 0) {
      warnings.push(
        `This month includes ${toHours(mine.exam)} h of exam monitoring, paid at the regular hourly rate. ` +
          `Check that is right before issuing.`,
      )
    }
  } else if (mine && (mine.demo > 0 || mine.exam > 0)) {
    const parts = [
      mine.demo > 0 ? `${toHours(mine.demo)} h of demo classes` : null,
      mine.exam > 0 ? `${toHours(mine.exam)} h of exams` : null,
    ].filter(Boolean)
    warnings.push(
      `This month includes ${parts.join(' and ')}. Pricing for demo classes and exams is not set, ` +
        `so the lines above count every recorded session at the regular hourly rate. ` +
        `Check them before issuing.`,
    )
  }

  // Separation of duties, surfaced rather than enforced (C-06). A tutor records the very
  // sessions that become their own pay, and until 0102 nothing recorded WHO entered the
  // hours - so a self-recorded month was indistinguishable from an independently recorded
  // one. Issuance is already admin-only, which makes the issuing admin the second party;
  // this tells them which hours nobody but the payee has attested, so that existing human
  // step becomes a real check instead of a rubber stamp.
  //
  // Not a block: refusing to bill unattested hours would stop payroll to fix a visibility
  // problem, and would strand every session recorded before 0102 (which carry no
  // attestation at all, and are correctly not counted here).
  if (kind === 'payslip') {
    const window = monthWindow(period, await getInstituteTimeZone())
    const selfRecorded = await countSelfRecordedSessions(partyId, window.startIso, window.endIso)
    if (selfRecorded > 0) {
      warnings.push(
        `${selfRecorded} of this month's sessions had their hours entered by the payee themselves. ` +
          `Nobody else has attested those hours - review them before issuing.`,
      )
    }
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
