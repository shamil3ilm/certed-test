'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { startConversationAction } from './actions'
import { useUI } from '../Providers'
import type { Contact } from '@/lib/messaging/recipient-policy'
import { Badge, CARD, Card, cx, initials, pillButtonClass } from '@/lib/ui'

const CONTACT_GROUP_LABELS: Record<Contact['personaKey'], string> = {
  admin: 'Super Admins',
  sub_admin: 'Sub Admins',
  mentor: 'Mentors',
  tutor: 'Tutors',
  student: 'Students',
}

/** Composer for a new conversation. Selecting one recipient starts a direct
 *  chat; selecting several starts a group. Failures toast instead of vanishing. */
export function NewMessageForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts])
  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return contacts
    return contacts.filter((contact) => contact.name.toLowerCase().includes(needle))
  }, [contacts, query])
  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedSet.has(contact.id)),
    [contacts, selectedSet],
  )
  const groupedContacts = useMemo(() => {
    const groups = new Map<Contact['personaKey'], Contact[]>()
    for (const contact of visibleContacts) {
      const current = groups.get(contact.personaKey)
      if (current) current.push(contact)
      else groups.set(contact.personaKey, [contact])
    }
    return [...groups.entries()]
  }, [visibleContacts])

  function sharedGroupContexts(contactIds: string[]): Set<string> {
    const selectedContacts = contactIds.map((id) => contactsById.get(id)).filter(Boolean) as Contact[]
    if (selectedContacts.length === 0) return new Set()

    let shared = new Set(selectedContacts[0].groupContextKeys)
    for (const contact of selectedContacts.slice(1)) {
      shared = new Set([...shared].filter((key) => contact.groupContextKeys.includes(key)))
    }
    return shared
  }

  function canAddRecipient(id: string): boolean {
    const nextIds = [...selected, id]
    if (nextIds.length <= 1) return true
    return sharedGroupContexts(nextIds).size > 0
  }

  function toggleRecipient(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length === 0) return [...current, id]
      const nextIds = [...current, id]
      if (sharedGroupContexts(nextIds).size > 0) return nextIds
      return current
    })

    if (!selectedSet.has(id) && selected.length > 0 && !canAddRecipient(id)) {
      toast('Only contacts connected through the same student or class can be added to a group.', 'error')
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || selected.length === 0) return

    setBusy(true)

    try {
      const submitData = new FormData()
      for (const id of selected) submitData.append('recipient_ids', id)

      const data = assertActionOk(await startConversationAction(submitData), 'Could not start the conversation') as {
        id: string
      }
      router.push(`/messages/${data.id}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start the conversation', 'error')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-h-[min(70vh,40rem)] flex-col gap-3">
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
                className={pillButtonClass(true, 'soft', 'inline-flex items-center gap-2 px-3')}
                aria-label={`Remove ${contact.name}`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold">
                  {initials(contact.name)}
                </span>
                <span>{contact.name}</span>
                <Badge tone="primary">{contact.personaLabel}</Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3">
          {groupedContacts.map(([groupKey, groupContacts]) => (
            <div key={groupKey} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">{CONTACT_GROUP_LABELS[groupKey]}</h3>
                <span className="text-xs text-slate-400">{groupContacts.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {groupContacts.map((contact) => {
                  const active = selectedSet.has(contact.id)
                  const incompatible = !active && selected.length > 0 && !canAddRecipient(contact.id)
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => toggleRecipient(contact.id)}
                      aria-pressed={active}
                      aria-disabled={incompatible}
                      disabled={incompatible}
                      className={cx(
                        CARD,
                        'group flex min-h-12 items-center gap-3 p-3 text-left transition',
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : incompatible
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                            : 'hover:-translate-y-0.5 hover:shadow-md',
                      )}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {initials(contact.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{contact.name}</span>
                        {contact.relationLabel && (
                          <span className="block truncate text-xs text-slate-400">{contact.relationLabel}</span>
                        )}
                        {incompatible && (
                          <span className="block truncate text-xs text-red-500">Not related to the current group</span>
                        )}
                      </span>
                      {active && <Badge tone="primary">Selected</Badge>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {visibleContacts.length === 0 && (
            <Card className="p-3 text-sm text-slate-400">No contacts match that search.</Card>
          )}
        </div>
      </div>

      {selected.map((id) => (
        <input key={id} type="hidden" name="recipient_ids" value={id} />
      ))}

      <div className="border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {selected.length > 1
              ? 'This will open a group conversation. Send the first message from the thread.'
              : 'This will open a direct conversation. Send the first message from the thread.'}
          </p>
          <button
            type="submit"
            disabled={busy || selected.length === 0}
            className="btn btn-sm btn-primary w-full sm:w-auto"
          >
            {busy ? 'Starting...' : selected.length > 1 ? 'Start group' : 'Start'}
          </button>
        </div>
      </div>
    </form>
  )
}
