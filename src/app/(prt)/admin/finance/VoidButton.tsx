'use client'
import { useState } from 'react'
import { useUI } from '../../Providers'

export function VoidButton({ endpoint }: { endpoint: string }) {
  const { confirm, toast } = useUI()
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        const ok = await confirm({
          title: 'Void this document?',
          message: 'It stays on record; reissue a corrected one.',
          confirmLabel: 'Void',
          variant: 'danger',
        })
        if (!ok) return
        setBusy(true)
        try {
          const res = await fetch(endpoint, { method: 'POST' })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || json.success === false) throw new Error(json.error ?? 'Failed to void')
          toast('Document voided', 'success')
          location.reload()
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Failed to void', 'error')
          setBusy(false)
        }
      }}
      className="btn btn-sm btn-danger"
    >
      Void
    </button>
  )
}
