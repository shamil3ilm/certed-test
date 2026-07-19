'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestJson } from '../../api-client'
import { useUI } from '../../Providers'

export function VoidButton({ endpoint }: { endpoint: string }) {
  const router = useRouter()
  const { confirm, toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [, startRefreshTransition] = useTransition()

  async function onClick() {
    const confirmed = await confirm({
      title: 'Void this document?',
      message: "It stays on record and can't be undone. To correct it, issue a new document with the right details.",
      confirmLabel: 'Void',
      variant: 'danger',
    })
    if (!confirmed) return

    setBusy(true)

    try {
      await requestJson(endpoint, { method: 'POST' })
      toast('Document voided', 'success')
      startRefreshTransition(() => {
        router.refresh()
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to void', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button disabled={busy} onClick={onClick} className="btn btn-sm btn-danger">
      Void
    </button>
  )
}
