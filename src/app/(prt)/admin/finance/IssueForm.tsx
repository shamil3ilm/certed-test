'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { computeTotals, lineAmount, formatMoney, SUPPORTED_CURRENCIES } from '@/lib/money'
import { requestJson } from '../../api-client'

type Party = { id: string; name: string }
type Line = { subject: string; hours: string; rate: string }

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
  endpoint,
}: {
  partyLabel: string
  parties: Party[]
  endpoint: string
}) {
  const router = useRouter()
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [currency, setCurrency] = useState('INR')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<Line[]>([{ subject: '', hours: '', rate: '' }])
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
    if (!partyId) return

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
      setDiscount('')
      setLines([{ subject: '', hours: '', rate: '' }])
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
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 text-sm">
          {partyLabel}
          <select
            value={partyId}
            onChange={(event) => setPartyId(event.target.value)}
            required
            className="mt-1 block w-full max-w-full rounded border px-2 py-1"
          >
            <option value="">Select...</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Date
          <input
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
            required
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="mt-1 block w-24 rounded border px-2 py-1"
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
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              placeholder="Subject"
              value={line.subject}
              onChange={(event) => setLine(index, { subject: event.target.value })}
              className="w-full min-w-0 rounded border px-2 py-1 sm:flex-1"
            />
            <input
              placeholder="Hours"
              type="number"
              step="0.25"
              value={line.hours}
              onChange={(event) => setLine(index, { hours: event.target.value })}
              className="w-20 rounded border px-2 py-1 sm:w-24"
            />
            <input
              placeholder="Rate/hr"
              type="number"
              step="0.01"
              value={line.rate}
              onChange={(event) => setLine(index, { rate: event.target.value })}
              className="w-24 rounded border px-2 py-1 sm:w-28"
            />
            <span className="w-16 text-right text-sm text-slate-500 sm:w-24">
              {safeMoney(lineAmount(Number(line.hours) || 0, Number(line.rate) || 0, currency), currency)}
            </span>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines((currentLines) => currentLines.filter((_, lineIndex) => lineIndex !== index))}
                className="text-slate-400 transition hover:text-red-600"
              >
                x
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((currentLines) => [...currentLines, { subject: '', hours: '', rate: '' }])}
          className="text-sm font-medium text-primary transition hover:underline"
        >
          + Add line
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
        <label>
          Discount{' '}
          <input
            type="number"
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            className="w-24 rounded border px-2 py-1"
          />
        </label>
        <span>Subtotal {safeMoney(subtotal, currency)}</span>
        <span className="text-base font-semibold">Total {safeMoney(total, currency)}</span>
      </div>

      <button disabled={busy || total <= 0 || (Number(discount) || 0) > subtotal} className="btn btn-primary">
        {busy ? 'Issuing...' : 'Issue'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
