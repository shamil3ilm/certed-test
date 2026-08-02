'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { computeTotals } from '@/lib/money'
import { createClientId } from '@/lib/ui/client-id'
import type { ActionResult } from '@/lib/api/action-error'
import { requestJson } from '../../api-client'
import { useUI } from '../../Providers'
import { IssueHeaderFields, IssueLineItems, IssueTotals, type Line, type Party } from './issue-form-parts'

function createEmptyLine(): Line {
  return { id: createClientId('line'), subject: '', hours: '', rate: '' }
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
      // Async mode has no native <select required>, so surface the same
      // validation nudge here instead of a silent no-op.
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
      <IssueHeaderFields
        partyLabel={partyLabel}
        parties={parties}
        searchParties={searchParties}
        partyId={partyId}
        partyName={partyName}
        issueDate={issueDate}
        currency={currency}
        onPartyChange={setPartyId}
        onPartyPick={(party) => {
          setPartyId(party.id)
          setPartyName(party.name)
        }}
        onPartyClear={() => {
          setPartyId('')
          setPartyName('')
        }}
        onIssueDateChange={setIssueDate}
        onCurrencyChange={setCurrency}
      />

      <IssueLineItems
        lines={lines}
        currency={currency}
        onLineChange={setLine}
        onRemoveLine={(index) => setLines((currentLines) => currentLines.filter((_, lineIndex) => lineIndex !== index))}
        onAddLine={() => setLines((currentLines) => [...currentLines, createEmptyLine()])}
      />

      <IssueTotals
        discount={discount}
        subtotal={subtotal}
        total={total}
        currency={currency}
        onDiscountChange={setDiscount}
      />

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
