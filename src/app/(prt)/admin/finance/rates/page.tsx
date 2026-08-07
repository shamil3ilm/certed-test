import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { isAdminTier } from '@/lib/capabilities'
import { loadFxRatesPageData } from '@/lib/services/finance/fx-admin'
import { BackLink, PageHeader } from '@/lib/ui'
import { RatesManager } from './RatesManager'

/**
 * Currency conversion management: the base currency, the effective-dated rates an
 * admin maintains, and the recompute that re-prices documents. Read-gated on
 * viewFinance; the mutations require admin tier (identity-only, never override
 * grantable), so a viewer without it is bounced rather than shown the controls.
 */
export default async function FxRatesPage() {
  const me = await requireCapability('viewFinance')
  if (!isAdminTier(me)) redirect('/dashboard?denied=1')
  const data = await loadFxRatesPageData(me.id)

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackLink href="/admin/finance">Finance</BackLink>
      <PageHeader
        title="Currency conversion"
        description="Normalise every receipt and pay slip into one base currency using rates you maintain by date."
      />
      <RatesManager data={data} />
    </main>
  )
}
