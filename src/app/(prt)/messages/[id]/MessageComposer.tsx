'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../../action-client'
import { sendMessageAction } from '../actions'
import { useUI } from '../../Providers'
import { Card } from '@/lib/ui'

/** The thread's send box. Unlike a bare server-action form, a failed send now
 *  toasts the reason and keeps the typed text so the user can retry. */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const { toast } = useUI()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)

    const formData = new FormData()
    formData.set('conversation_id', conversationId)
    formData.set('body', text)

    try {
      assertActionOk(await sendMessageAction(formData), 'Could not send your message')
      setBody('') // clear only on success; a failure leaves the draft intact
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not send your message', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-3">
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <textarea
          name="body"
          required
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a message..."
          className="min-h-[2.5rem] flex-1 resize-y rounded border px-2 py-1 text-sm"
        />
        <button disabled={busy} className="btn btn-sm btn-primary">
          {busy ? 'Sending...' : 'Send'}
        </button>
      </form>
    </Card>
  )
}
