'use client'

import { useState, useTransition } from 'react'
import { SUPPORTED_CURRENCIES } from '@/lib/money'
import type { RatePerson } from '@/lib/services/finance/billing-rates-admin'
import { assertActionOk } from '../../../action-client'
import { useUI } from '../../../Providers'
import { setBillingRateAction } from './actions'

/**
 * One editable rate per person. Saved a row at a time rather than as one big form: an
 * academy edits a handful of rates at a time, and a per-row save means a mistake in one
 * person's figure cannot roll back everyone else's.
 */
function RateRow({ person }: { person: RatePerson }) {
  const [rate, setRate] = useState(person.rate == null ? '' : String(person.rate))
  const [currency, setCurrency] = useState(person.currency)
  const [isPending, startTransition] = useTransition()
  const { toast } = useUI()

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        assertActionOk(await setBillingRateAction(formData), 'Could not save the rate')
        toast(rate === '' ? 'Rate cleared' : 'Rate saved', 'success')
      } catch {
        toast('Could not save the rate', 'error')
      }
    })
  }

  return (
    <tr className="border-t">
      <td className="p-2 font-medium text-slate-800">{person.name}</td>
      <td className="p-2">
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="profile_id" value={person.id} />
          <input type="hidden" name="side" value={person.side} />
          <label className="sr-only" htmlFor={`rate-${person.id}`}>
            Hourly rate for {person.name}
          </label>
          <input
            id={`rate-${person.id}`}
            name="rate"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder="Not set"
            className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <label className="sr-only" htmlFor={`currency-${person.id}`}>
            Currency for {person.name}
          </label>
          <select
            id={`currency-${person.id}`}
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isPending} className="btn btn-sm btn-soft">
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      </td>
    </tr>
  )
}

export function RateRows({ people, emptyLabel }: { people: RatePerson[]; emptyLabel: string }) {
  if (people.length === 0) {
    return <p className="mt-3 text-sm text-slate-600">{emptyLabel}</p>
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="data-table w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600">
            <th scope="col" className="p-2">
              Person
            </th>
            <th scope="col" className="p-2">
              Hourly rate
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <RateRow key={`${person.side}:${person.id}`} person={person} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
