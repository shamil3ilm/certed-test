import 'server-only'
import { convertMoney } from '@/lib/money'
import { resolveRate, type ExchangeRate } from '@/lib/finance/fx'
import { selectOrgSettings } from '@/lib/data/org-settings'
import type { FinanceKind } from './finance-docs'
import { requireActorCapability } from '@/lib/services/authorization'
import { selectExchangeRates } from '@/lib/data/exchange-rates'
import {
  callApplyFxConversions,
  callFxSourceVersion,
  selectConvertibleDoc,
  selectConvertibleDocs,
  type ConvertibleDoc,
  type DocConversion,
  type PricedDoc,
} from '@/lib/data/finance-fx'
import { writeAudit } from '@/lib/data/audit'

/**
 * The conversion engine: price documents into the academy base currency from the
 * admin's effective-dated rates. The overlay (base_total/fx_rate) is a reporting
 * projection - the document body stays immutable - so it is recomputed whenever a
 * rate or the base currency changes.
 *
 * Pricing happens here (currency rounding lives in @/lib/money); the write is one guarded
 * transaction (0112). The version of the inputs is read BEFORE the inputs themselves, so a
 * rate or base change landing mid-way makes the write refuse rather than store figures priced
 * from the older table, and the pricing simply runs again on the new one.
 */

const KINDS: FinanceKind[] = ['receipt', 'payslip']
const FX_DENIED = 'Only an admin can manage currency conversion.'

/** Pricing runs this many times before giving up on inputs that keep changing under it. */
const MAX_ATTEMPTS = 3

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

/** Price `docs` against the inputs as they stand, tagged with the version they were read at. */
async function price(docsFor: () => Promise<Array<{ kind: FinanceKind; doc: ConvertibleDoc }>>) {
  const version = await callFxSourceVersion()
  const [org, rates, docs] = await Promise.all([selectOrgSettings(), selectExchangeRates(), docsFor()])
  const rows: PricedDoc[] = docs.map(({ kind, doc }) => ({
    kind,
    id: doc.id,
    ...conversionFor(doc, org.base_currency, rates),
  }))
  return { version, rows }
}

export type RecomputeResult = { converted: number; unconverted: number }

/**
 * Re-prices every non-void document into the current base currency from the
 * current rate table, all or nothing. Run after a rate is added/corrected or the
 * base currency changes. Admin-gated.
 */
export async function recomputeConversions(actorId: string): Promise<RecomputeResult> {
  await requireActorCapability(actorId, 'manageAdminTier', FX_DENIED)
  const everyDoc = async () =>
    (
      await Promise.all(KINDS.map(async (kind) => (await selectConvertibleDocs(kind)).map((doc) => ({ kind, doc }))))
    ).flat()

  for (let attempt = 1; ; attempt++) {
    const { version, rows } = await price(everyDoc)
    const applied = await callApplyFxConversions(version, rows)
    if (!applied.ok) {
      if (attempt < MAX_ATTEMPTS) continue
      throw new Error('fx.recompute: the rates or base currency kept changing while documents were re-priced')
    }
    // Best-effort audit: the recompute already succeeded, so a failed audit write
    // should not turn a completed re-pricing into an error the admin retries.
    await writeAudit({
      actor_id: actorId,
      action: 'fx.recompute',
      entity_type: 'org_settings',
      entity_id: null,
    }).catch((e) => console.error('[fx] recompute audit failed:', e))
    const unconverted = rows.filter((row) => row.base_total == null).length
    return { converted: rows.length - unconverted, unconverted }
  }
}

/**
 * Best-effort conversion of a single freshly-issued document, called after
 * issuance. A missing rate leaves it unconverted for the next recompute; it never
 * blocks issuance, so it is not permission-gated (the caller already is). If the rates
 * keep changing, the recompute each change runs prices this document too.
 */
export async function convertIssuedDoc(kind: FinanceKind, docId: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const doc = await selectConvertibleDoc(kind, docId)
    if (!doc) return
    const { version, rows } = await price(async () => [{ kind, doc }])
    if ((await callApplyFxConversions(version, rows)).ok) return
  }
}
