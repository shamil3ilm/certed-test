'use client'
import { useState } from 'react'

export function SubmitForm({ assignmentId }: { assignmentId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const init = await fetch('/api/submissions/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignmentId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      }).then((r) => r.json())
      if (!init.success) throw new Error(init.error ?? 'init failed')

      const put = await fetch(init.data.sessionUri, { method: 'PUT', body: file })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
      const uploaded = await put.json()

      const fin = await fetch('/api/submissions/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId, drive_file_id: uploaded.id }),
      }).then((r) => r.json())
      if (!fin.success) throw new Error(fin.error ?? 'finalize failed')
      location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
        className="text-sm"
      />
      <button disabled={busy} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">
        {busy ? 'Submitting…' : 'Submit'}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  )
}
