import type { FinanceKind } from '@/lib/data/finance-docs'

/**
 * What differs between the two kinds of finance document, in one place.
 *
 * A receipt bills a student for hours received; a pay slip pays a tutor or mentor for hours
 * taught. Which roles may be the party, which hourly rate applies, which number prefix is used
 * and what the admin reads it called all live here, so a new payee role or a third kind is one
 * edit rather than a search for every inline `kind === 'receipt'` branch. Screens, the issue
 * path, the draft builder and the data layer read them from here.
 *
 * Pure constants, safe on the client.
 */
export const FINANCE_KINDS = {
  receipt: {
    /** How the document is named in a sentence. */
    noun: 'receipt',
    /** How it is named at the start of a label. */
    title: 'Receipt',
    /** Who it is issued to, in a sentence. */
    partyNoun: 'student',
    /** The roles that may be its party. */
    partyRoles: ['student'],
    /** The billing_rates column that prices its hours. */
    rateField: 'fee_rate',
    rateNoun: 'fee rate',
    /** The org_settings column holding its number prefix. */
    prefixField: 'receipt_prefix',
    /** Whether it snapshots the party's class level. */
    carriesClassLevel: true,
    /** What the party did in the sessions it bills. */
    sessionsVerb: 'attended',
  },
  payslip: {
    noun: 'pay slip',
    title: 'Pay slip',
    partyNoun: 'payee',
    partyRoles: ['tutor', 'mentor'],
    rateField: 'pay_rate',
    rateNoun: 'pay rate',
    prefixField: 'payslip_prefix',
    carriesClassLevel: false,
    sessionsVerb: 'taught',
  },
} as const satisfies Record<
  FinanceKind,
  {
    noun: string
    title: string
    partyNoun: string
    partyRoles: readonly string[]
    rateField: 'fee_rate' | 'pay_rate'
    rateNoun: string
    prefixField: 'receipt_prefix' | 'payslip_prefix'
    carriesClassLevel: boolean
    sessionsVerb: string
  }
>

/** Whether `role` may be the party of a document of this kind. */
export function isFinanceParty(kind: FinanceKind, role: string): boolean {
  return (FINANCE_KINDS[kind].partyRoles as readonly string[]).includes(role)
}
