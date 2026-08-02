'use client'

import { formatMoney, lineAmount, SUPPORTED_CURRENCIES } from '@/lib/money'
import type { ActionResult } from '@/lib/api/action-error'
import { AsyncPartyPicker as AsyncPicker } from './AsyncPartyPicker'

export type Party = { id: string; name: string }
export type Line = { id: string; subject: string; hours: string; rate: string }

export const ISSUE_FORM_FIELD_CLASS = 'mt-1 block w-full rounded border px-2 py-2'
export const LINE_INPUT_CLASS = 'w-full min-w-0 rounded border px-2 py-2'

export function safeMoney(value: number, currency: string): string {
  try {
    return formatMoney(value, currency || 'INR')
  } catch {
    return String(value)
  }
}

export function IssueHeaderFields({
  partyLabel,
  parties,
  searchParties,
  partyId,
  partyName,
  issueDate,
  currency,
  onPartyChange,
  onPartyPick,
  onPartyClear,
  onIssueDateChange,
  onCurrencyChange,
}: {
  partyLabel: string
  parties?: Party[]
  searchParties?: (query: string) => Promise<ActionResult<Party[]>>
  partyId: string
  partyName: string
  issueDate: string
  currency: string
  onPartyChange: (value: string) => void
  onPartyPick: (party: Party) => void
  onPartyClear: () => void
  onIssueDateChange: (value: string) => void
  onCurrencyChange: (value: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {searchParties ? (
        <AsyncPicker
          label={partyLabel}
          selectedName={partyName}
          onSearch={searchParties}
          onPick={onPartyPick}
          onClear={onPartyClear}
        />
      ) : (
        <label className="min-w-0 text-sm">
          {partyLabel}
          <select
            value={partyId}
            onChange={(event) => onPartyChange(event.target.value)}
            required
            className={ISSUE_FORM_FIELD_CLASS}
          >
            <option value="">Select...</option>
            {(parties ?? []).map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        Date
        <input
          type="date"
          value={issueDate}
          onChange={(event) => onIssueDateChange(event.target.value)}
          required
          className={ISSUE_FORM_FIELD_CLASS}
        />
      </label>
      <label className="text-sm">
        Currency
        <select
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value)}
          className={ISSUE_FORM_FIELD_CLASS}
        >
          {SUPPORTED_CURRENCIES.map((supportedCurrency) => (
            <option key={supportedCurrency} value={supportedCurrency}>
              {supportedCurrency}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function IssueLineItems({
  lines,
  currency,
  onLineChange,
  onRemoveLine,
  onAddLine,
}: {
  lines: Line[]
  currency: string
  onLineChange: (index: number, patch: Partial<Line>) => void
  onRemoveLine: (index: number) => void
  onAddLine: () => void
}) {
  return (
    <div className="space-y-2">
      {lines.map((line, index) => (
        <div
          key={line.id}
          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto_auto] sm:items-end"
        >
          <label className="w-full min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">Subject</span>
            <input
              aria-label={`Subject for line ${index + 1}`}
              value={line.subject}
              onChange={(event) => onLineChange(index, { subject: event.target.value })}
              className={LINE_INPUT_CLASS}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Hours</span>
            <input
              aria-label={`Hours for line ${index + 1}`}
              type="number"
              step="0.25"
              value={line.hours}
              onChange={(event) => onLineChange(index, { hours: event.target.value })}
              className={LINE_INPUT_CLASS}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Rate per hour</span>
            <input
              aria-label={`Rate per hour for line ${index + 1}`}
              type="number"
              step="0.01"
              value={line.rate}
              onChange={(event) => onLineChange(index, { rate: event.target.value })}
              className={LINE_INPUT_CLASS}
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Amount</span>
            <span className="inline-flex min-h-11 items-center text-sm text-slate-500">
              {safeMoney(lineAmount(Number(line.hours) || 0, Number(line.rate) || 0, currency), currency)}
            </span>
          </div>
          {lines.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveLine(index)}
              aria-label={`Remove line ${index + 1}`}
              className="min-h-11 min-w-11 rounded-md px-3 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onAddLine}
        className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/5 hover:underline"
      >
        + Add line
      </button>
    </div>
  )
}

export function IssueTotals({
  discount,
  subtotal,
  total,
  currency,
  onDiscountChange,
}: {
  discount: string
  subtotal: number
  total: number
  currency: string
  onDiscountChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-end">
      <label className="sm:text-right">
        Discount{' '}
        <input
          type="number"
          step="0.01"
          value={discount}
          onChange={(event) => onDiscountChange(event.target.value)}
          className="ml-2 w-24 rounded border px-2 py-1"
        />
      </label>
      <span>Subtotal {safeMoney(subtotal, currency)}</span>
      <span className="text-base font-semibold">Total {safeMoney(total, currency)}</span>
    </div>
  )
}
