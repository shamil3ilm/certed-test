'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cx } from '@/lib/ui'
import type { FxRatesPageData } from '@/lib/services/finance/fx-admin'
import { useUI } from '../../../Providers'
import { addRateAction, deleteRateAction, recomputeAction, setBaseCurrencyAction } from './actions'

const INPUT =
  'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
const LABEL = 'text-xs font-medium uppercase tracking-wide text-slate-600'

type Note = { tone: 'ok' | 'error'; text: string } | null

export function RatesManager({ data }: { data: FxRatesPageData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { confirm } = useUI()
  const [note, setNote] = useState<Note>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setNote(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        setNote({ tone: 'ok', text: okText })
        router.refresh()
      } else {
        setNote({ tone: 'error', text: res.error ?? 'Something went wrong.' })
      }
    })
  }

  const nonBaseCurrencies = data.currencies.filter((c) => c !== data.baseCurrency)

  return (
    <div className="space-y-6">
      {note && (
        <p
          className={cx(
            'rounded-lg px-3 py-2 text-sm',
            note.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
          )}
        >
          {note.text}
        </p>
      )}

      {/* Base currency */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Base currency</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every academy figure (the dashboard Net and revenue chart) reports in this currency. Changing it re-prices
          every document.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Currency</span>
            <select
              className={INPUT}
              defaultValue={data.baseCurrency}
              disabled={pending}
              // Confirmed, and the select is restored when declined: this re-prices every
              // document, and a change event fires as a keyboard user ARROWS through the
              // options - so the un-confirmed version re-priced the ledger on a keystroke.
              onChange={async (e) => {
                const next = e.target.value
                const select = e.target
                const ok = await confirm({
                  title: `Change the base currency to ${next}?`,
                  message:
                    'Every receipt and pay slip is re-priced into this currency, and academy totals report in it.',
                  confirmLabel: `Use ${next}`,
                })
                if (!ok) {
                  select.value = data.baseCurrency
                  return
                }
                run(() => setBaseCurrencyAction(next), `Base currency set to ${next}.`)
              }}
            >
              {data.currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={pending}
            onClick={() => run(() => recomputeAction(), 'Conversions recomputed.')}
          >
            Recompute conversions
          </button>
        </div>
      </section>

      {/* Currencies awaiting a rate */}
      {data.needingRate.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">Currencies awaiting a rate</h2>
          <p className="mt-1 text-sm text-amber-700">
            Documents in {data.needingRate.join(', ')} are not yet converted to {data.baseCurrency}. Add a rate below,
            effective on or before their issue date.
          </p>
        </section>
      )}

      {/* Add a rate */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Add a rate</h2>
        <p className="mt-1 text-sm text-slate-600">
          One unit of the currency in {data.baseCurrency}, effective from a date. A document uses the newest rate on or
          before its issue date.
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          action={(formData) => run(() => addRateAction(formData), 'Rate added.')}
        >
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Currency</span>
            <select name="currency" className={INPUT} required defaultValue="">
              <option value="" disabled>
                Select
              </option>
              {nonBaseCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Rate (1 unit in {data.baseCurrency})</span>
            <input name="rate" type="number" step="0.00000001" min="0" className={cx(INPUT, 'w-36')} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Effective from</span>
            <input name="effective_from" type="date" className={INPUT} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Note (optional)</span>
            <input name="note" type="text" maxLength={200} className={cx(INPUT, 'w-44')} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            Add rate
          </button>
        </form>
      </section>

      {/* Existing rates */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Rates</h2>
        {data.rates.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No rates yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="py-1.5 pr-3 font-medium">Currency</th>
                  <th className="py-1.5 pr-3 font-medium">Rate</th>
                  <th className="py-1.5 pr-3 font-medium">Effective from</th>
                  <th className="py-1.5 pr-3 font-medium">Note</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{r.currency}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-600">
                      1 {r.currency} = {r.rate} {r.base_currency}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-600">{r.effective_from}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{r.note ?? '-'}</td>
                    <td className="py-1.5 text-right">
                      {/* Confirmed like the sibling VoidButton on the same finance surface:
                          removing a rate deletes the row AND recomputes conversions across
                          every receipt and pay slip, and recovery means retyping the exact
                          rate and effective date. */}
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        disabled={pending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Remove this rate?',
                            message: `${r.currency} to ${r.base_currency} from ${r.effective_from} is deleted and every document is re-priced without it.`,
                            confirmLabel: 'Remove rate',
                            variant: 'danger',
                          })
                          if (ok) run(() => deleteRateAction(r.id), 'Rate removed.')
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
