'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { startConversationAction } from './actions'
import { useUI } from '../Providers'
import type { Contact } from '@/lib/messaging/recipient-policy'

/** Composer for a new conversation. Selecting one recipient starts a direct
 *  chat; selecting several starts a group. Failures toast instead of vanishing. */
export function NewMessageForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const [selected, setSelected] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (selected.length === 0 || busy) return
    setBusy(true)

    const formData = new FormData()
    for (const id of selected) formData.append('recipient_ids', id)
    if (body.trim()) formData.set('body', body.trim())

    try {
      const data = assertActionOk(await startConversationAction(formData), 'Could not start the conversation') as {
        id: string
      }
      router.push(`/messages/${data.id}`) // success -> navigate; component unmounts
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start the conversation', 'error')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="block text-xs font-medium text-slate-500">
        To <span className="text-slate-400">(pick one for a direct message, or several for a group)</span>
        <select
          name="recipient_ids"
          multiple
          required
          size={Math.min(Math.max(contacts.length, 3), 6)}
          value={selected}
          onChange={(event) => setSelected(Array.from(event.target.selectedOptions, (o) => o.value))}
          className="mt-1 block w-full rounded border px-2 py-1 text-sm"
        >
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <input
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a message... (optional)"
          className="min-w-[12rem] flex-1 rounded border px-2 py-1 text-sm"
        />
        <button disabled={busy || selected.length === 0} className="btn btn-sm btn-primary">
          {busy ? 'Starting...' : selected.length > 1 ? 'Start group' : 'Start'}
        </button>
      </div>
    </form>
  )
}
