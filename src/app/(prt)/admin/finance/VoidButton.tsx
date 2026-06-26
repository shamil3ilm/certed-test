'use client'
import { useState } from 'react'

export function VoidButton({ endpoint }: { endpoint: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm('Void this document? It stays on record; reissue a corrected one.')) return
        setBusy(true)
        await fetch(endpoint, { method: 'POST' })
        location.reload()
      }}
      className="text-red-700 hover:underline disabled:opacity-50"
    >
      Void
    </button>
  )
}
