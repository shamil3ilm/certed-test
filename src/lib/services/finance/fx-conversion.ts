import 'server-only'
import { convertMoney } from '@/lib/money'
import { resolveRate, type ExchangeRate } from '@/lib/finance/fx'
import { selectOrgSettings } from '@/lib/data/org-settings'
import type { FinanceKind } from './finance-docs'
import { requireActorCapability } from '@/lib/services/authorization'
import { selectExchangeRates } from '@/lib/data/exchange-rates'
import {
  selectConvertibleDoc,
  selectConvertibleDocs,
  updateDocConversion,
  type ConvertibleDoc,
  type DocConversion,
} from '@/lib/data/finance-fx'
import { writeAudit } from '@/lib/data/audit'

/**
 * The conversion engine: price documents into the academy base currency from the
 * admin's effective-dated rates. The overlay (base_total/fx_rate) is a reporting
 * projection - the document body stays immutable - so it is recomputed whenever a
 * rate or the base currency changes.
 */

const KINDS: FinanceKind[] = ['receipt', 'payslip']
const FX_DENIED = 'Only an admin can manage currency conversion.'

function conversionFor(doc: ConvertibleDoc, base: string, rates: ReadonlyArray<ExchangeRate>): DocConversion {
  const resolved = resolveRate(rates, doc.currency, base, doc.issue_date)
  if (!resolved) return { base_currency: base, base_total: null, fx_rate: null, fx_rate_id: null }
  return {
    base_currency: base,
    base_total: convertMoney(doc.total, resolved.rate, base),
    fx_rate: resolved.rate,
    fx_rate_id: resolved.rateId,
  }
}

export type RecomputeResult = { converted: number; unconverted: number }

/**
 * Re-prices every non-void document into the current base currency from the
 * current rate table. Run after a rate is added/corrected or the base currency
 * changes. Admin-gated.
 */
export async function recomputeConversions(actorId: string): Promise<RecomputeResult> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  const [org, rates] = await Promise.all([selectOrgSettings(), selectExchangeRates()])
  const base = org.base_currency
  let converted = 0
  let unconverted = 0
  for (const kind of KINDS) {
    const docs = await selectConvertibleDocs(kind)
    for (const doc of docs) {
      const conv = conversionFor(doc, base, rates)
      await updateDocConversion(kind, doc.id, conv)
      if (conv.base_total == null) unconverted += 1
      else converted += 1
    }
  }
  // Best-effort audit: the recompute already succeeded, so a failed audit write
  // should not turn a completed re-pricing into an error the admin retries.
  await writeAudit({ actor_id: actorId, action: 'fx.recompute', entity_type: 'org_settings', entity_id: null }).catch(
    (e) => console.error('[fx] recompute audit failed:', e),
  )
  return { converted, unconverted }
}

/**
 * Best-effort conversion of a single freshly-issued document, called after
 * issuance. A missing rate leaves it unconverted for the next recompute; it never
 * blocks issuance, so it is not permission-gated (the caller already is).
 */
export async function convertIssuedDoc(kind: FinanceKind, docId: string): Promise<void> {
  const doc = await selectConvertibleDoc(kind, docId)
  if (!doc) return
  const [org, rates] = await Promise.all([selectOrgSettings(), selectExchangeRates()])
  await updateDocConversion(kind, docId, conversionFor(doc, org.base_currency, rates))
}
