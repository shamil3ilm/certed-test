import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { isAdminTier } from '@/lib/capabilities'
import { loadBillingRatesPageData } from '@/lib/services/finance/billing-rates-admin'
import { BackLink, PageHeader } from '@/lib/ui'
import { RateRows } from './RateRows'

/**
 * Hourly rates - the input that lets a receipt or pay slip be generated from recorded
 * class hours instead of typed in.
 *
 * Read-gated on viewFinance and then narrowed to admin tier, matching the currency-
 * conversion screen: a rate is money data and decides what every future document charges,
 * so it never reaches an override-granted finance VIEWER. Row-level security says the same
 * (0095), which is what stops a tutor reading their own pay rate directly.
 *
 * A person with no rate is listed FIRST and shown as "Not set" rather than 0 - a zero rate
 * and an absent one are different things, and only the absent one blocks generation.
 */
export default async function BillingRatesPage() {
  const me = await requireCapability('viewFinance')
  if (!isAdminTier(me)) redirect('/dashboard?denied=1')
  const { students, payees, baseCurrency } = await loadBillingRatesPageData()

  const missing = [...students, ...payees].filter((p) => p.rate == null).length

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackLink href="/admin/finance">Finance</BackLink>
      <PageHeader
        title="Hourly rates"
        description={`What each student pays and each tutor or mentor earns per hour. Receipts and pay slips are generated from these rates and the recorded class hours. New people default to ${baseCurrency}.`}
      />

      {missing > 0 && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {missing} {missing === 1 ? 'person has' : 'people have'} no rate set. A document cannot be generated from
          hours for them until one is.
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-800">Students - fee per hour</h2>
      <p className="mt-0.5 text-xs text-slate-600">Charged on the receipt for the hours the student attended.</p>
      <RateRows people={students} emptyLabel="No active students." />

      <h2 className="mt-8 text-sm font-semibold text-slate-800">Tutors and mentors - pay per hour</h2>
      <p className="mt-0.5 text-xs text-slate-600">Paid on the pay slip for the hours the person taught.</p>
      <RateRows people={payees} emptyLabel="No active tutors or mentors." />
    </main>
  )
}
