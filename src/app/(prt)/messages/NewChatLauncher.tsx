'use client'

import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import type { Contact } from '@/lib/messaging/recipient-policy'
import { Modal } from '../Modal'
import { Card } from '@/lib/ui'
import { NewMessageForm } from './NewMessageForm'

export function NewChatLauncher({ contacts }: { contacts: Contact[] }) {
  const [open, setOpen] = useState(false)

  if (contacts.length === 0) {
    return (
      <Card className="mb-5 p-4">
        <h2 className="text-sm font-semibold text-slate-700">New chat</h2>
        <p className="mt-2 text-sm text-slate-400">You have no contacts you can message yet.</p>
      </Card>
    )
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="btn btn-soft">
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New chat
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-lg transition hover:scale-[1.02] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:hidden"
        aria-label="Start new chat"
      >
        <MessageSquarePlus className="h-6 w-6" aria-hidden="true" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="New chat" size="lg">
        <p className="mb-3 text-sm text-slate-500">
          Start a new conversation with anyone you&apos;re allowed to contact.
        </p>
        <NewMessageForm contacts={contacts} />
      </Modal>
    </>
  )
}
