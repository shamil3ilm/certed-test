import 'server-only'
import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/money'
import { ValidationError } from '@/lib/errors'
import { listActiveByRole, listActiveMentorCandidates } from '@/lib/services/users'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { selectAllBillingRates, upsertBillingRate } from '@/lib/data/billing-rates'

/**
 * The admin screen behind hours-based billing: one hourly rate per person, which is what
 * turns recorded class hours into receipt and pay-slip lines.
 *
 * Callers must be admin tier. The table's RLS says the same (0095), but these reads run
 * under the service role, so the gate that actually matters is the one in the action.
 */

export interface RatePerson {
  id: string
  name: string
  /** Which rate applies to this person: students pay a fee, tutors/mentors earn pay. */
  side: 'fee' | 'pay'
  rate: number | null
  currency: string
}

export interface BillingRatesPageData {
  students: RatePerson[]
  payees: RatePerson[]
  /** Used as the default currency for a person who has no rate row yet. */
  baseCurrency: string
}

/**
 * Everyone who can carry a rate, with the rate they currently have.
 *
 * The roster is listed in FULL rather than searched, unlike the receipt party picker: the
 * question this page answers is "who is MISSING a rate", which a search box cannot show.
 * That is a deliberate trade - it is admin-tier only, the same tier that already reads
 * every name in the finance ledger.
 */
export async function loadBillingRatesPageData(): Promise<BillingRatesPageData> {
  const [students, payees, stored, org] = await Promise.all([
    listActiveByRole('student'),
    listActiveMentorCandidates(),
    selectAllBillingRates(),
    getOrgSettings(),
  ])
  // org_settings.base_currency is NOT NULL DEFAULT 'INR' in the schema, but an org row
  // created before that default (or the mock's fixture) can still arrive without it, and
  // an undefined here would print "default to undefined" and preselect nothing.
  const baseCurrency = org.base_currency ?? 'INR'
  const byId = new Map(stored.map((r) => [r.profile_id, r]))

  const shape = (people: { id: string; name: string }[], side: 'fee' | 'pay'): RatePerson[] =>
    people
      .map((person) => {
        const row = byId.get(person.id)
        return {
          id: person.id,
          name: person.name,
          side,
          rate: row ? (side === 'fee' ? row.fee_rate : row.pay_rate) : null,
          currency: row?.currency ?? baseCurrency,
        }
      })
      // Unrated people first: they are the ones whose documents cannot be generated yet.
      .sort((a, b) => Number(a.rate != null) - Number(b.rate != null) || a.name.localeCompare(b.name))

  return { students: shape(students, 'fee'), payees: shape(payees, 'pay'), baseCurrency }
}

const rateInputSchema = z.object({
  profile_id: z.string().uuid(),
  side: z.enum(['fee', 'pay']),
  // Blank clears the rate, which is how an admin stops a person being billable without
  // deleting their history. Anything else must be a non-negative number.
  rate: z
    .union([z.literal(''), z.coerce.number().nonnegative().max(1_000_000)])
    .transform((v) => (v === '' ? null : v)),
  currency: z.enum(SUPPORTED_CURRENCIES),
})

export interface SetBillingRateInput {
  profile_id: unknown
  side: unknown
  rate: unknown
  currency: unknown
}

/**
 * Set (or clear) one person's hourly rate.
 *
 * Writing one side preserves the other: a person may be BOTH a student and a payee in a
 * family-run academy, and a blind upsert of the whole row would silently wipe the side
 * that was not being edited.
 */
export async function setBillingRate(actorId: string, input: SetBillingRateInput): Promise<void> {
  const parsed = rateInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Enter a valid rate and currency.')
  const { profile_id, side, rate, currency } = parsed.data

  const existing = (await selectAllBillingRates()).find((r) => r.profile_id === profile_id)
  await upsertBillingRate({
    profile_id,
    fee_rate: side === 'fee' ? rate : (existing?.fee_rate ?? null),
    pay_rate: side === 'pay' ? rate : (existing?.pay_rate ?? null),
    currency,
    updated_by: actorId,
  })

  // Audited: a rate change silently re-prices every document generated afterwards, so
  // "who set 600/hour, and when" has to be answerable. The VALUE is deliberately not in
  // the metadata - the audit log is readable by more people than the rate itself is.
  await auditPrivilegedAction({ id: actorId }, `billing_rate.${side}_set`, 'profile', profile_id, {
    cleared: rate == null,
    currency,
  })
}
