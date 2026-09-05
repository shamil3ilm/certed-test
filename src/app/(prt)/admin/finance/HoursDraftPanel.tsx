'use client'

import { useState } from 'react'
import { formatMonthLabel } from '@/lib/time/format'
import { requestJson } from '../../api-client'

/** Mirrors BillingDraft from @/lib/services/finance/hours-billing (the JSON the draft
 *  endpoint returns), narrowed to what this form needs. */
export interface BillingDraft {
  partyName: string
  period: string
  currency: string
  lines: { subject: string; hours: number; rate: number; amount: number }[]
  subtotal: number
  total: number
  warnings: string[]
  blocked: string | null
}

/**
 * "Fill from recorded hours": fetches the hours-derived draft for the selected party and
 * month and hands it to the issue form, which the admin then reviews and issues.
 *
 * Deliberately a FILL, not an issue. A finance document takes the next number from a
 * shared counter and can only be voided afterwards, so the irreversible step stays a
 * human pressing Issue on figures they can see. Everything before that is derived.
 */
export function HoursDraftPanel({
  partyLabel,
  partyId,
  draftEndpoint,
  defaultMonth,
  onFilled,
}: {
  partyLabel: string
  partyId: string
  draftEndpoint: string
  defaultMonth: string
  onFilled: (draft: BillingDraft) => void
}) {
  const [month, setMonth] = useState(defaultMonth)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  async function fill() {
    setBusy(true)
    setNote(null)
    setWarnings([])
    try {
      const draft = await requestJson<BillingDraft>(
        `${draftEndpoint}?party=${encodeURIComponent(partyId)}&month=${encodeURIComponent(month)}`,
      )
      if (draft.blocked) {
        setNote(draft.blocked)
        return
      }
      setWarnings(draft.warnings)
      onFilled(draft)
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not build the draft')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Bill for month</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <button type="button" onClick={fill} disabled={busy || !partyId} className="btn btn-sm btn-soft">
          {busy ? 'Reading hours...' : 'Fill from recorded hours'}
        </button>
        {!partyId && <span className="text-xs text-slate-600">Choose a {partyLabel.toLowerCase()} first.</span>}
      </div>

      {note && (
        <p role="status" className="mt-2 text-xs text-slate-700">
          {note}
        </p>
      )}
      {warnings.map((warning) => (
        // A warning is not an error: the figures are filled in and issuing is still
        // allowed. It exists so a duplicate month is a decision, not an accident.
        <p key={warning} role="alert" className="mt-2 text-xs font-medium text-amber-700">
          {warning}
        </p>
      ))}
      <p className="mt-2 text-micro text-slate-600">
        Lines are derived from recorded session times for {formatMonthLabel(month)} at this person&apos;s stored hourly
        rate. Review them before issuing - a document cannot be edited afterwards, only voided.
      </p>
    </div>
  )
}
