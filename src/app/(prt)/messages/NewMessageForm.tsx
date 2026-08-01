'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { startConversationAction } from './actions'
import { useUI } from '../Providers'
import type { Contact } from '@/lib/messaging/recipient-policy'
import { Badge, Card, cx, initials } from '@/lib/ui'

/** Composer for a new conversation. Selecting one recipient starts a direct
 *  chat; selecting several starts a group. Failures toast instead of vanishing. */
export function NewMessageForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const [selected, setSelected] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return contacts
    return contacts.filter((contact) => contact.name.toLowerCase().includes(needle))
  }, [contacts, query])
  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedSet.has(contact.id)),
    [contacts, selectedSet],
  )

  function toggleRecipient(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const recipientIds = selected
    const openingMessage = body.trim()
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="message-recipient-search" className="block text-xs font-medium text-slate-500">
            To <span className="text-slate-400">(pick one for a direct message, or several for a group)</span>
          </label>
          <span className="text-xs text-slate-400">
            {selected.length === 0 ? 'No recipients selected' : `${selected.length} selected`}
          </span>
        </div>
        <input
          id="message-recipient-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts..."
          className="w-full"
        />
        {selectedContacts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => toggleRecipient(contact.id)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
                aria-label={`Remove ${contact.name}`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold">
                  {initials(contact.name)}
                </span>
                <span>{contact.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleContacts.map((contact) => {
            const active = selectedSet.has(contact.id)
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => toggleRecipient(contact.id)}
                aria-pressed={active}
                className={cx(
                  'flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50',
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {initials(contact.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{contact.name}</span>
                  <span className="block text-xs text-slate-400">{active ? 'Selected' : 'Tap to add'}</span>
                </span>
                {active && <Badge tone="primary">Selected</Badge>}
              </button>
            )
          })}
          {visibleContacts.length === 0 && (
            <Card className="sm:col-span-2 p-3 text-sm text-slate-400">No contacts match that search.</Card>
          )}
        </div>
        {selected.map((id) => (
          <input key={id} type="hidden" name="recipient_ids" value={id} />
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Opening message</span>
        <textarea
          name="body"
          rows={3}
          aria-label="Opening message"
          placeholder="Write your message..."
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="w-full resize-y"
        />
        <span className="mt-1 block text-xs text-slate-400">
          Optional. Leave this blank to open the conversation first and send later.
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {selected.length > 1 ? 'This will start a group conversation.' : 'This will open a direct conversation.'}
        </p>
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
