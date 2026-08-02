'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useUI } from '../../Providers'
import { assertActionOk } from '../../action-client'
import { renameConversationAction } from '../actions'

export function RenameGroupForm({ conversationId, initialTitle }: { conversationId: string; initialTitle: string }) {
  const router = useRouter()
  const { toast } = useUI()
  const [title, setTitle] = useState(initialTitle)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const formData = new FormData()
      formData.set('conversation_id', conversationId)
      formData.set('title', title)
      assertActionOk(await renameConversationAction(formData), 'Could not rename the group')
      toast('Group name updated.', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not rename the group', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1">
        <span className="mb-1 block text-xs font-medium text-slate-500">Group name</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          className="w-full"
          placeholder="Enter a group name"
        />
      </label>
      <button type="submit" disabled={busy} className="btn btn-sm btn-soft w-full sm:w-auto">
        {busy ? 'Saving...' : 'Rename group'}
      </button>
    </form>
  )
}
