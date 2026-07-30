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
  const [status, setStatus] = useState('')

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
      // Announce success to assistive tech (the failure path already toasts).
      setStatus('Message sent.')
      router.refresh()
    } catch (error) {
      setStatus('')
      toast(error instanceof Error ? error.message : 'Could not send your message', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-3">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Message</span>
          <textarea
            name="body"
            required
            rows={2}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a message..."
            className="min-h-[2.75rem] w-full resize-y rounded border px-2 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
          {busy ? 'Sending...' : 'Send'}
        </button>
      </form>
    </Card>
  )
}
