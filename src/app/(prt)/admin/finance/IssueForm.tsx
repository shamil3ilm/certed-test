'use client'
import { useState } from 'react'
import { computeTotals, lineAmount, formatMoney } from '@/lib/money'

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
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [currency, setCurrency] = useState('INR')
  const [discount, setDiscount] = useState('')
  const [lines, setLines] = useState<Line[]>([{ subject: '', hours: '', rate: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numeric = lines.map((l) => ({ hours: Number(l.hours) || 0, rate: Number(l.rate) || 0 }))
  const { subtotal, total } = computeTotals(numeric, Number(discount) || 0)

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!partyId) return
    const valid = lines.filter((l) => l.subject && Number(l.hours) > 0 && Number(l.rate) >= 0)
    if (!valid.length) {
      setError('Add at least one line')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_id: partyId,
          issue_date: new Date(issueDate).toISOString(),
          currency,
          discount: discount ? Number(discount) : undefined,
          lines: valid.map((l) => ({ subject: l.subject, hours: Number(l.hours), rate: Number(l.rate) })),
        }),
      }).then((r) => r.json())
      if (!res.success) throw new Error(res.error ?? 'failed')
      location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 text-sm">
          {partyLabel}
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} required className="mt-1 block w-full max-w-full rounded border px-2 py-1">
            <option value="">Select…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Date
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required className="mt-1 block rounded border px-2 py-1" />
        </label>
        <label className="text-sm">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 block w-24 rounded border px-2 py-1">
            {['INR', 'AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'USD'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input placeholder="Subject" value={l.subject} onChange={(e) => setLine(i, { subject: e.target.value })} className="w-full min-w-0 rounded border px-2 py-1 sm:flex-1" />
            <input placeholder="Hours" type="number" step="0.25" value={l.hours} onChange={(e) => setLine(i, { hours: e.target.value })} className="w-20 rounded border px-2 py-1 sm:w-24" />
            <input placeholder="Rate/hr" type="number" step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="w-24 rounded border px-2 py-1 sm:w-28" />
            <span className="w-16 text-right text-sm text-slate-500 sm:w-24">
              {safeMoney(lineAmount(Number(l.hours) || 0, Number(l.rate) || 0), currency)}
            </span>
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-slate-400 transition hover:text-red-600">×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { subject: '', hours: '', rate: '' }])} className="text-sm font-medium text-primary transition hover:underline">
          + Add line
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
        <label>
          Discount{' '}
          <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 rounded border px-2 py-1" />
        </label>
        <span>Subtotal {safeMoney(subtotal, currency)}</span>
        <span className="text-base font-semibold">Total {safeMoney(total, currency)}</span>
      </div>

      <button disabled={busy} className="btn btn-primary">
        {busy ? 'Issuing…' : 'Issue'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
