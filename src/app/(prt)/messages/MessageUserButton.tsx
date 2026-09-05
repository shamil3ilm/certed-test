'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { assertActionOk } from '../action-client'
import { startConversationAction } from './actions'
import { useUI } from '../Providers'
import { cx } from '@/lib/ui'

/** A quick "Message <person>" button (people lists, profile pages). Opens/reuses
 *  a 1:1 thread and navigates to it; a failure toasts instead of doing nothing. */
export function MessageUserButton({
  recipientId,
  className,
  children = 'Message',
  'aria-label': ariaLabel,
}: {
  recipientId: string
  className?: string
  children?: ReactNode
  /** Names the recipient, for one of these repeated per row in a people list. */
  'aria-label'?: string
}) {
  const router = useRouter()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    if (busy) return
    setBusy(true)
    const formData = new FormData()
    formData.append('recipient_ids', recipientId)
    try {
      const data = assertActionOk(await startConversationAction(formData), 'Could not open the conversation') as {
        id: string
      }
      router.push(`/messages/${data.id}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not open the conversation', 'error')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={cx('btn', className || 'btn-soft')}
    >
      {busy ? 'Opening...' : children}
    </button>
  )
}
