'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  const recipientRef = useRef<HTMLSelectElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  function syncSelectedFromDom() {
    const input = recipientRef.current
    if (!input) return
    setSelected(Array.from(input.selectedOptions, (option) => option.value))
  }

  useEffect(() => {
    syncSelectedFromDom()
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const recipientIds = formData.getAll('recipient_ids').map(String).filter(Boolean)
    const openingMessage = String(formData.get('body') ?? '').trim()
    if (recipientIds.length === 0) return

    setBusy(true)

    try {
      const submitData = new FormData()
      for (const id of recipientIds) submitData.append('recipient_ids', id)
      if (openingMessage) submitData.set('body', openingMessage)

      const data = assertActionOk(await startConversationAction(submitData), 'Could not start the conversation') as {
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
          ref={recipientRef}
          name="recipient_ids"
          multiple
          required
          size={Math.min(Math.max(contacts.length, 3), 6)}
          value={selected}
          onChange={syncSelectedFromDom}
          onInput={syncSelectedFromDom}
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
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Opening message</span>
          <input
            name="body"
            aria-label="Opening message"
            placeholder="Write your message..."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || selected.length === 0}
          className="btn btn-sm btn-primary w-full sm:w-auto"
        >
          {busy ? 'Starting...' : selected.length > 1 ? 'Start group' : 'Start'}
        </button>
      </div>
    </form>
  )
}
