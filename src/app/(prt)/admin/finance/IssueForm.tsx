'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { computeTotals, lineAmount, formatMoney, SUPPORTED_CURRENCIES } from '@/lib/money'
import { createClientId } from '@/lib/ui/client-id'
import type { ActionResult } from '@/lib/api/action-error'
import { requestJson } from '../../api-client'
import { useUI } from '../../Providers'
import { AsyncPartyPicker } from './AsyncPartyPicker'

type Party = { id: string; name: string }
type Line = { id: string; subject: string; hours: string; rate: string }
const ISSUE_FORM_FIELD_CLASS = 'mt-1 block w-full rounded border px-2 py-2'
const LINE_INPUT_CLASS = 'w-full min-w-0 rounded border px-2 py-2'

function createEmptyLine(): Line {
  return { id: createClientId('line'), subject: '', hours: '', rate: '' }
}

function safeMoney(n: number, cur: string): string {
  try {
    return formatMoney(n, cur || 'INR')
  } catch {
    return String(n)
  }
}

export function IssueForm({
  partyLabel,
  parties,
  searchParties,
  endpoint,
  defaultIssueDate,
}: {
  partyLabel: string
  /** Eager candidate list (pay-slip payees). Omitted when `searchParties` drives
   *  an on-demand typeahead instead (the receipt student picker). */
  parties?: Party[]
  /** Gated async search; when present the party picker is a typeahead rather than
   *  a preloaded <select>, so the full roster is never shipped to the client. */
  searchParties?: (query: string) => Promise<ActionResult<Party[]>>
  endpoint: string
  defaultIssueDate: string
}) {
  const router = useRouter()
  const { toast } = useUI()
  const isReceipt = endpoint.includes('receipt')
  const [partyId, setPartyId] = useState('')
  // The chosen party's display name, only needed in async mode (the eager <select>
  // derives its label from `parties`). partyId stays the single committed value.
  const [partyName, setPartyName] = useState('')
  // Seeded from a server-computed date (see the finance page) so the input's
  // value matches between SSR and hydration.
  const [issueDate, setIssueDate] = useState(defaultIssueDate)
  const [currency, setCurrency] = useState('INR')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<Line[]>([createEmptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startRefreshTransition] = useTransition()

  const numeric = lines.map((line) => ({
    hours: Number(line.hours) || 0,
    rate: Number(line.rate) || 0,
  }))
  const { subtotal, total } = computeTotals(numeric, Number(discount) || 0, currency)

  function setLine(index: number, patch: Partial<Line>) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    )
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!partyId) {
      // Async mode has no native <select required>, so give the same nudge the
      // eager select's browser validation used to, instead of a silent no-op.
      setError(`Select a ${partyLabel.toLowerCase()}`)
      return
    }

    const validLines = lines.filter((line) => line.subject && Number(line.hours) > 0 && Number(line.rate) >= 0)
    if (!validLines.length) {
      setError('Add at least one line')
      return
    }

    if ((Number(discount) || 0) > subtotal) {
      setError('Discount cannot exceed the subtotal')
      return
    }

    if (total <= 0) {
      setError('Total must be greater than zero')
      return
    }

    setBusy(true)
    setError(null)

    try {
      await requestJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_id: partyId,
          issue_date: new Date(issueDate).toISOString(),
          currency,
          discount: discount ? Number(discount) : undefined,
          lines: validLines.map((line) => ({
            subject: line.subject,
            hours: Number(line.hours),
            rate: Number(line.rate),
          })),
        }),
      })

      setPartyId('')
      setPartyName('')
      setDiscount('')
      setLines([createEmptyLine()])
      toast(isReceipt ? 'Receipt issued' : 'Pay slip issued', 'success')
      startRefreshTransition(() => {
        router.refresh()
      })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not issue the document')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {searchParties ? (
          <AsyncPartyPicker
            label={partyLabel}
            selectedName={partyName}
            onSearch={searchParties}
            onPick={(party) => {
              setPartyId(party.id)
              setPartyName(party.name)
            }}
            onClear={() => {
              setPartyId('')
              setPartyName('')
            }}
          />
        ) : (
          <label className="min-w-0 text-sm">
            {partyLabel}
            <select
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
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
            onChange={(event) => setIssueDate(event.target.value)}
            required
            className={ISSUE_FORM_FIELD_CLASS}
          />
        </label>
        <label className="text-sm">
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
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
                onChange={(event) => setLine(index, { subject: event.target.value })}
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
                onChange={(event) => setLine(index, { hours: event.target.value })}
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
                onChange={(event) => setLine(index, { rate: event.target.value })}
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
                onClick={() => setLines((currentLines) => currentLines.filter((_, lineIndex) => lineIndex !== index))}
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
          onClick={() => setLines((currentLines) => [...currentLines, createEmptyLine()])}
          className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/5 hover:underline"
        >
          + Add line
        </button>
      </div>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-end">
        <label className="sm:text-right">
          Discount{' '}
          <input
            type="number"
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            className="ml-2 w-24 rounded border px-2 py-1"
          />
        </label>
        <span>Subtotal {safeMoney(subtotal, currency)}</span>
        <span className="text-base font-semibold">Total {safeMoney(total, currency)}</span>
      </div>

      <button
        type="submit"
        disabled={busy || total <= 0 || (Number(discount) || 0) > subtotal}
        className="btn btn-primary"
      >
        {busy ? 'Issuing...' : 'Issue'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}
